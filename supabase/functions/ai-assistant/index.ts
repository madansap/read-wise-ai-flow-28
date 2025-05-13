import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  chatSystemPrompt,
  chatUserPromptTemplate,
  quizSystemPrompt,
  quizUserPromptTemplate,
  quizEvalSystemPrompt,
  quizEvalUserPromptTemplate,
  explainSelectionSystemPrompt,
  explainSelectionUserPromptTemplate
} from "./prompts.ts";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { extract } from "https://deno.land/x/pdf@v0.1.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Embedding chunk size
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const MAX_CONTEXT_CHUNKS = 5; // Maximum number of chunks to include in context

// Utility: get embeddings for text using OpenAI
async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.replace(/\n/g, " "),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Error getting embeddings");
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Utility: create text chunks
function createChunks(text: string, chunkSize: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const chunk = text.slice(i, i + chunkSize);
    chunks.push(chunk);
    i += chunkSize - overlap;
  }
  return chunks;
}

// Process PDF: Extract text, create chunks, and generate embeddings
async function processPdf(
  pdfBytes: ArrayBuffer,
  bookId: string,
  userId: string,
  supabase: any,
  openaiApiKey: string
): Promise<{ success: boolean; pages: number; chunks: number }> {
  try {
    // Extract text from PDF
    const pdfData = new Uint8Array(pdfBytes);
    const pdfText = await extract(pdfData);
    
    if (!pdfText || !pdfText.pages || pdfText.pages.length === 0) {
      throw new Error("Failed to extract text from PDF");
    }

    // Store each page
    const pageInserts = [];
    const pageIds = [];
    
    for (let i = 0; i < pdfText.pages.length; i++) {
      const pageContent = pdfText.pages[i].text || "";
      const pageId = crypto.randomUUID();
      pageIds.push(pageId);
      
      pageInserts.push({
        id: pageId,
        book_id: bookId,
        user_id: userId,
        page_number: i + 1,
        content: pageContent,
        created_at: new Date().toISOString()
      });
    }
    
    // Insert all pages
    const { error: pageError } = await supabase.from('book_pages').insert(pageInserts);
    if (pageError) {
      throw new Error(`Failed to insert pages: ${pageError.message}`);
    }
    
    // Process chunks and embeddings (page by page to avoid timeout)
    let totalChunks = 0;
    
    for (let i = 0; i < pageIds.length; i++) {
      const pageId = pageIds[i];
      const pageContent = pdfText.pages[i].text || "";
      const chunks = createChunks(pageContent);
      totalChunks += chunks.length;
      
      // Process each chunk
      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j];
        if (chunk.trim().length < 10) continue; // Skip empty chunks
        
        // Get embedding
        const embedding = await getEmbedding(chunk, openaiApiKey);
        
        // Insert chunk with embedding
        await supabase.from('book_chunks').insert({
          book_id: bookId,
          page_id: pageId,
          chunk_index: j,
          content: chunk,
          embedding
        });
      }
      
      // Update processing status every 5 pages
      if (i % 5 === 0 || i === pageIds.length - 1) {
        await supabase
          .from('books')
          .update({ 
            processing_status: `Processing ${i + 1} of ${pageIds.length} pages...` 
          })
          .eq('id', bookId);
      }
    }
    
    // Mark book as processed
    await supabase
      .from('books')
      .update({ 
        is_processed: true,
        processing_status: 'Complete' 
      })
      .eq('id', bookId);
    
    return { 
      success: true, 
      pages: pageIds.length,
      chunks: totalChunks
    };
  } catch (error) {
    console.error("PDF processing error:", error);
    
    // Update book with error status
    await supabase
      .from('books')
      .update({ 
        is_processed: false,
        processing_status: `Error: ${error.message}` 
      })
      .eq('id', bookId);
    
    throw error;
  }
}

// Semantic search to find relevant chunks
async function findRelevantChunks(
  query: string, 
  bookId: string,
  pageNumber: number | null,
  supabase: any, 
  openaiApiKey: string,
  limit: number = MAX_CONTEXT_CHUNKS
): Promise<string> {
  // Get embedding for the query
  const queryEmbedding = await getEmbedding(query, openaiApiKey);
  
  // Build the search query
  let matchQuery = supabase
    .rpc('match_book_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: limit,
      p_book_id: bookId
    });
  
  // If page number is provided, limit to chunks from that page or adjacent pages
  if (pageNumber !== null) {
    const { data: pageId } = await supabase
      .from('book_pages')
      .select('id')
      .eq('book_id', bookId)
      .eq('page_number', pageNumber)
      .single();
    
    if (pageId?.id) {
      // Also get adjacent pages
      const adjacentPages = await supabase
        .from('book_pages')
        .select('id')
        .eq('book_id', bookId)
        .in('page_number', [pageNumber - 1, pageNumber, pageNumber + 1]);
      
      const pageIds = adjacentPages.data.map(p => p.id);
      
      // Limit search to these pages
      matchQuery = matchQuery.in('page_id', pageIds);
    }
  }
  
  // Execute the search
  const { data: chunks, error } = await matchQuery;
  
  if (error) {
    console.error("Error searching for chunks:", error);
    return "";
  }
  
  if (!chunks || chunks.length === 0) {
    return "";
  }
  
  // Sort by similarity and concat
  chunks.sort((a, b) => b.similarity - a.similarity);
  
  // Get page numbers for context
  const enhancedChunks = await Promise.all(
    chunks.map(async (chunk) => {
      const { data: page } = await supabase
        .from('book_pages')
        .select('page_number')
        .eq('id', chunk.page_id)
        .single();
      
      return {
        ...chunk,
        page_number: page?.page_number || 0
      };
    })
  );
  
  // Format the chunks with page numbers
  const contextText = enhancedChunks
    .map(chunk => `--- Page ${chunk.page_number} ---\n${chunk.content}`)
    .join('\n\n');
  
  return contextText;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Get the request path
  const url = new URL(req.url);
  const path = url.pathname;
  
  // Create Supabase client
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Configure OpenAI
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    return new Response(
      JSON.stringify({ error: "OpenAI API key is not configured" }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  // PDF Processing endpoint
  if (path === "/extract-pdf-text" && req.method === "POST") {
    try {
      const { book_id, user_id, file_path } = await req.json();
      
      if (!book_id || !user_id || !file_path) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }), 
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Update book processing status
      await supabase
        .from('books')
        .update({ 
          is_processed: false,
          processing_status: 'Downloading PDF...' 
        })
        .eq('id', book_id);
      
      // Download the PDF from Supabase Storage
      const { data, error } = await supabase.storage.from('books').download(file_path);
      
      if (error || !data) {
        return new Response(
          JSON.stringify({ error: `Failed to download PDF: ${error?.message || 'Unknown error'}` }), 
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Process the PDF
      const pdfBytes = await data.arrayBuffer();
      
      // Update status
      await supabase
        .from('books')
        .update({ processing_status: 'Extracting text and creating embeddings...' })
        .eq('id', book_id);
      
      // Process the PDF (extract text, create chunks, generate embeddings)
      const result = await processPdf(pdfBytes, book_id, user_id, supabase, openaiApiKey);
      
      return new Response(
        JSON.stringify(result), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error processing PDF:", error);
      return new Response(
        JSON.stringify({ error: error.message }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } 
  
  // Main AI assistant endpoint
  if (path === "/" && req.method === "POST") {
    try {
      const requestBody = await req.json();
      const { 
        bookContent, 
        userQuestion, 
        conversationId, 
        user, 
        mode = "chat", 
        numQuestions = 3, 
        quizEvaluation = null, 
        bookId = null,
        pageNumber = null,
        selectedText = null
      } = requestBody;
      
      // For RAG-enhanced queries
      let contextText = "";
      let selectedContext = "";
      
      // If bookId is provided, use RAG to enhance context
      if (bookId && (mode === "chat" || mode === "explainSelection" || mode === "quiz")) {
        // For chat and quiz modes, get context based on the question
        const searchQuery = mode === "chat" 
          ? userQuestion 
          : (mode === "explainSelection" ? selectedText : "");
        
        // Only search if we have a query
        if (searchQuery) {
          contextText = await findRelevantChunks(
            searchQuery, 
            bookId, 
            pageNumber, 
            supabase, 
            openaiApiKey
          );
        }
        
        // If we're in explainSelection mode and have pageNumber, get the full page content
        if (mode === "explainSelection" && pageNumber !== null) {
          const { data: pageData } = await supabase
            .from('book_pages')
            .select('content')
            .eq('book_id', bookId)
            .eq('page_number', pageNumber)
            .single();
          
          if (pageData?.content) {
            selectedContext = pageData.content;
          }
        }
      }
      
      // Normal processing continues
      let systemPrompt;
      let userPrompt;
      let temperature = 0.3;
      let model = "gpt-4o-mini";
      
      switch (mode) {
        case "chat":
          systemPrompt = chatSystemPrompt;
          
          // If we have context from RAG, use it instead of the provided bookContent
          const effectiveBookContent = contextText || bookContent || "";
          userPrompt = chatUserPromptTemplate(effectiveBookContent, userQuestion);
          
          // If using RAG context, modify the prompt to include the source
          if (contextText) {
            userPrompt = `I'm going to answer based on the following relevant sections from the book:\n\n${contextText}\n\n${userQuestion}`;
          }
          
          temperature = 0.3;
          break;
        
        case "quiz":
          systemPrompt = quizSystemPrompt;
          userPrompt = quizUserPromptTemplate(contextText || bookContent, numQuestions);
          temperature = 0.7;
          break;
        
        case "quizEvaluation":
          systemPrompt = quizEvalSystemPrompt;
          const { question, options, correctIndex, userAnswerIndex } = quizEvaluation;
          userPrompt = quizEvalUserPromptTemplate(
            bookContent, 
            question, 
            options, 
            correctIndex, 
            userAnswerIndex
          );
          temperature = 0.4;
          break;
        
        case "explainSelection":
          systemPrompt = explainSelectionSystemPrompt;
          
          // If we have selectedContext from RAG, use it to provide more context
          if (selectedContext && selectedText) {
            userPrompt = `The user has selected the following text from page ${pageNumber}:\n\n"${selectedText}"\n\nHere's additional context from the page:\n\n${selectedContext}\n\nAnd here are relevant passages from the book:\n\n${contextText}\n\nPlease explain the selected text in detail, using all available context.`;
          } else {
            userPrompt = explainSelectionUserPromptTemplate(bookContent || selectedText);
          }
          
          temperature = 0.2;
          model = "gpt-4"; // Use GPT-4 for better explanations
          break;
        
        default:
          throw new Error(`Unsupported mode: ${mode}`);
      }
      
      console.log(`Calling OpenAI API in ${mode} mode...`);
      
      // Call OpenAI API
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature,
          max_tokens: mode === "explainSelection" ? 1000 : 500,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Error from OpenAI API");
      }
      
      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content;
      
      if (!aiResponse) {
        throw new Error("No response from AI model");
      }
      
      // Save the conversation if in chat mode
      if (mode === "chat" && conversationId && user) {
        try {
          // Save user message
          await supabase
            .from('ai_messages')
            .insert({
              conversation_id: conversationId,
              role: 'user',
              content: userQuestion
            });
          
          // Save AI response
          await supabase
            .from('ai_messages')
            .insert({
              conversation_id: conversationId,
              role: 'assistant',
              content: aiResponse
            });
        } catch (error) {
          console.error('Error saving conversation:', error);
        }
      }
      
      return new Response(
        JSON.stringify({ 
          response: aiResponse,
          context_used: !!contextText, // Flag if RAG was used
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error in AI assistant function:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }
  
  // Return 404 for unknown paths
  return new Response(
    JSON.stringify({ error: "Not found" }),
    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
