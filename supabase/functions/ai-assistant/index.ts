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
import * as pdfjs from "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Embedding chunk size
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const MAX_CONTEXT_CHUNKS = 5; // Maximum number of chunks to include in context

// Add importMap to configure external dependencies for Deno
const PDFJS_VERSION = '3.11.174';
const PDFJS_WORKER_SRC = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;

// Initialize PDF.js with worker
async function initPDFJS() {
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
    console.log('PDF.js worker configured with version:', PDFJS_VERSION);
  } catch (error) {
    console.error("Error initializing PDF.js worker:", error);
  }
}

// Utility: get embeddings for text using Google Gemini
async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1/models/embedding-001:embedContent?key=" + apiKey, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: {
          parts: [
            { text: text.replace(/\n/g, " ") }
          ]
        }
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Embedding API error:", error);
      throw new Error(error.error?.message || "Error getting embeddings");
    }

    const data = await response.json();
    return data.embedding.values;
  } catch (error) {
    console.error("Error in getEmbedding:", error);
    throw error;
  }
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

// Add type declarations for Deno
declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
  }
  export const env: Env;
}

// Define interfaces for our data structures
interface BookPage {
  id: string;
  book_id: string;
  user_id: string;
  page_number: number;
  content: string;
  created_at: string;
}

interface BookChunk {
  id?: string;
  book_id: string;
  page_id: string;
  chunk_index: number;
  content: string;
  embedding: number[];
  similarity?: number;
}

// Define a type for search results
interface SearchResult extends BookChunk {
  similarity: number;
  page_number?: number;
  book_title?: string;
}

// Process PDF: Extract text, create chunks, and generate embeddings
async function processPdf(
  pdfBytes: ArrayBuffer,
  bookId: string,
  userId: string,
  supabase: any,
  apiKey: string
): Promise<{ success: boolean; pages: number; chunks: number; message?: string }> {
  try {
    // Load the PDF data
    const pdfData = new Uint8Array(pdfBytes);
    console.log(`Starting PDF extraction for book_id: ${bookId}, size: ${pdfData.length} bytes`);
    
    // Initialize PDF.js
    await initPDFJS();
    
    try {
      const loadingTask = pdfjs.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
      console.log(`PDF loaded successfully with ${pdf.numPages} pages`);
      
      // Process each page to extract text
      const pageTexts: string[] = [];
      const pageIds: string[] = [];
      const pageInserts: any[] = [];
      
      // Process in smaller batches to avoid memory issues
      const BATCH_SIZE = 5; // Process 5 pages at a time
      
      // Update book with total pages count
      await supabase
        .from('books')
        .update({ 
          total_pages: pdf.numPages,
          processing_status: 'Extracting text...' 
        })
        .eq('id', bookId);
      
      // Process pages in batches
      for (let batchStart = 0; batchStart < pdf.numPages; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, pdf.numPages);
        const batchPromises = [];
        
        for (let i = batchStart; i < batchEnd; i++) {
          batchPromises.push((async () => {
            try {
              const pageNum = i + 1;
              
              // Update status for first page in batch or first overall page
              if (i === batchStart || i === 0) {
                await supabase
                  .from('books')
                  .update({ 
                    processing_status: `Extracting text: page ${pageNum} of ${pdf.numPages}` 
                  })
                  .eq('id', bookId);
              }
              
              // Get the page
              const page = await pdf.getPage(pageNum);
              
              // Extract text content
              const textContent = await page.getTextContent();
              const pageText = textContent.items
                .map((item: any) => item.str || '')
                .join(' ');
              
              // Generate a unique ID for the page
              const pageId = crypto.randomUUID();
              
              return {
                pageText,
                pageId,
                pageInsert: {
                  id: pageId,
                  book_id: bookId,
                  user_id: userId,
                  page_number: pageNum,
                  content: pageText,
                  created_at: new Date().toISOString()
                }
              };
            } catch (pageError) {
              console.error(`Error processing page ${i + 1}:`, pageError);
              return null;
            }
          })());
        }
        
        // Wait for the batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Filter out any nulls from errors
        const validResults = batchResults.filter(result => result !== null);
        
        // Store the page data
        for (const result of validResults) {
          if (!result) continue; // TypeScript safety - though we already filtered
          
          pageTexts.push(result.pageText);
          pageIds.push(result.pageId);
          pageInserts.push(result.pageInsert);
        }
        
        // Insert pages in batch
        if (pageInserts.length > 0) {
          await supabase
            .from('book_pages')
            .insert(pageInserts);
            
          console.log(`Inserted batch of ${pageInserts.length} pages`);
        }
      }
      
      console.log(`Extracted text from ${pageTexts.length} pages`);
      
      // Update status - creating chunks
      await supabase
        .from('books')
        .update({ 
          processing_status: 'Creating text chunks and generating embeddings...' 
        })
        .eq('id', bookId);
      
      // Create chunks and get embeddings
      let totalChunks = 0;
      
      // Process page chunks in batches
      for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex++) {
        const pageId = pageIds[pageIndex];
        const pageText = pageTexts[pageIndex];
        const pageNum = pageIndex + 1;
        
        // Update status every 10 pages
        if (pageIndex % 10 === 0) {
          await supabase
            .from('books')
            .update({ 
              processing_status: `Processing embeddings: page ${pageNum} of ${pageTexts.length}` 
            })
            .eq('id', bookId);
        }
        
        // Create chunks for this page
        const chunks = createChunks(pageText);
        
        // Max 20 chunks per batch to avoid Gemini/OpenAI rate limits
        const EMBEDDING_BATCH_SIZE = 20;
        
        for (let chunkBatchStart = 0; chunkBatchStart < chunks.length; chunkBatchStart += EMBEDDING_BATCH_SIZE) {
          const chunkBatchEnd = Math.min(chunkBatchStart + EMBEDDING_BATCH_SIZE, chunks.length);
          const currentChunkBatch = chunks.slice(chunkBatchStart, chunkBatchEnd);
          
          // Process chunks in parallel but with reasonable concurrency
          const chunkPromises = currentChunkBatch.map(async (chunkText, i) => {
            const chunkIndex = chunkBatchStart + i;
            
            try {
              // Get embedding for chunk
              const embedding = await getEmbedding(chunkText, apiKey);
              
              // Create chunk record
              return {
                book_id: bookId,
                page_id: pageId,
                chunk_index: chunkIndex,
                content: chunkText,
                embedding
              };
            } catch (error) {
              console.error(`Error processing chunk ${chunkIndex} from page ${pageNum}:`, error);
              return null;
            }
          });
          
          // Wait for all chunks in this batch to be processed
          const chunkResults = await Promise.all(chunkPromises);
          const validChunks = chunkResults.filter(chunk => chunk !== null);
          
          // Insert chunks in Supabase
          if (validChunks.length > 0) {
            await supabase
              .from('book_chunks')
              .insert(validChunks);
              
            totalChunks += validChunks.length;
            console.log(`Inserted ${validChunks.length} chunks from page ${pageNum}, total: ${totalChunks}`);
          }
        }
      }
      
      // Update book status when complete
      await supabase
        .from('books')
        .update({ 
          is_processed: true,
          processing_status: 'Complete'
        })
        .eq('id', bookId);
      
      console.log(`PDF processing complete. Processed ${pageTexts.length} pages and ${totalChunks} chunks.`);
      
      return {
        success: true,
        pages: pageTexts.length,
        chunks: totalChunks
      };
    } catch (error: any) {
      console.error("Error in PDF processing:", error);
      
      // Update book with the error
      await supabase
        .from('books')
        .update({ 
          is_processed: false,
          processing_status: `Error: ${error.message || "Unknown error in PDF processing"}` 
        })
        .eq('id', bookId);
      
      return {
        success: false,
        pages: 0,
        chunks: 0,
        message: error.message || "Unknown error in PDF processing"
      };
    }
  } catch (error: any) {
    console.error("Error in processPdf outer try/catch:", error);
    
    // Update book with the error
    await supabase
      .from('books')
      .update({ 
        is_processed: false,
        processing_status: `Error: ${error.message || "Unknown error in PDF processing"}` 
      })
      .eq('id', bookId);
    
    return {
      success: false,
      pages: 0,
      chunks: 0,
      message: error.message || "Error in PDF processing"
    };
  }
}

// Semantic search to find relevant chunks
async function findRelevantChunks(
  query: string, 
  bookId: string,
  pageNumber: number | null,
  supabase: any, 
  apiKey: string,
  limit: number = MAX_CONTEXT_CHUNKS
): Promise<string> {
  try {
    console.log("Finding relevant chunks for query:", query);
    
    // Get embedding for the query
    const queryEmbedding = await getEmbedding(query, apiKey);
    
    // Search for relevant chunks using vector similarity
    const { data: chunks, error } = await supabase
      .rpc('match_book_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,  // Reduce threshold to get more matches
        match_count: limit * 2,  // Get more chunks than needed, then filter
        p_book_id: bookId
      });
    
    if (error) {
      console.error("Error searching for chunks:", error);
      return "";
    }
    
    if (!chunks || chunks.length === 0) {
      // Fallback to keyword search if vector search returns no results
      console.log("No vector matches found, trying keyword search");
      
      // Extract keywords from query
      const keywords = query.split(/\s+/)
        .filter(word => word.length > 3)
        .map(word => word.replace(/[^\w]/g, ''));
      
      if (keywords.length > 0) {
        // Use basic text search for each keyword
        const keywordPromises = keywords.map(async (keyword) => {
          if (keyword.length < 3) return []; // Skip very short keywords
          
          const { data } = await supabase
            .from('book_chunks')
            .select('*')
            .eq('book_id', bookId)
            .ilike('content', `%${keyword}%`)
            .limit(3);
          
          return data || [];
        });
        
        const keywordResults = await Promise.all(keywordPromises);
        chunks.push(...keywordResults.flat());
      }
      
      if (!chunks || chunks.length === 0) {
        return "";
      }
    }
    
    // If we have a pageNumber, prioritize chunks from the current page
    let enhancedChunks = await Promise.all(
      chunks.map(async (chunk) => {
        try {
          // Get page info
          const { data: page } = await supabase
            .from('book_pages')
            .select('page_number')
            .eq('id', chunk.page_id)
            .single();
          
          // Get book title
          const { data: book } = await supabase
            .from('books')
            .select('title')
            .eq('id', bookId)
            .single();
          
          return {
            ...chunk,
            page_number: page?.page_number || 0,
            book_title: book?.title || 'Unknown'
          };
        } catch (error) {
          console.error("Error enhancing chunk:", error);
          return {
            ...chunk,
            page_number: 0,
            book_title: 'Unknown'
          };
        }
      })
    );
    
    // Prioritize chunks from current page
    if (pageNumber) {
      enhancedChunks.sort((a, b) => {
        // First prioritize by current page
        if (a.page_number === pageNumber && b.page_number !== pageNumber) return -1;
        if (a.page_number !== pageNumber && b.page_number === pageNumber) return 1;
        
        // Then by similarity
        return (b.similarity || 0) - (a.similarity || 0);
      });
    } else {
      // Otherwise sort by similarity (highest first)
      enhancedChunks.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    }
    
    // Now take only the top chunks after resorting
    enhancedChunks = enhancedChunks.slice(0, limit);
    
    // Format the chunks with metadata, sorting by page number for readability
    enhancedChunks.sort((a, b) => a.page_number - b.page_number);
    
    const contextText = enhancedChunks
      .map((chunk, index) => 
        `[EXCERPT FROM PAGE ${chunk.page_number}]\n${chunk.content}\n[END EXCERPT]`
      )
      .join('\n\n');
    
    console.log(`Found ${enhancedChunks.length} relevant chunks`);
    return contextText;
  } catch (error) {
    console.error("Error in findRelevantChunks:", error);
    return "";
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Debug logging for request and environment variables
    console.log("Function triggered at:", new Date().toISOString());
    console.log("Request headers:", Object.fromEntries([...req.headers.entries()]));
    
    // Create a clone of the request to read the body multiple times
    const reqClone = req.clone();
    let rawBody;
    try {
      rawBody = await reqClone.text();
      console.log("Raw request body:", rawBody);
    } catch (readError) {
      console.error("Error reading request body:", readError);
      return new Response(
        JSON.stringify({ 
          error: "Could not read request body",
          success: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Check environment variables
    console.log("GOOGLE_API_KEY exists:", !!Deno.env.get("GOOGLE_API_KEY"));
    console.log("SUPABASE_URL exists:", !!Deno.env.get("SUPABASE_URL"));
    console.log("SUPABASE_SERVICE_ROLE_KEY exists:", !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    
    // Parse request body safely
    let requestBody;
    try {
      requestBody = JSON.parse(rawBody);
      console.log("Parsed request body:", requestBody);
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      return new Response(
        JSON.stringify({ 
          error: "Invalid JSON in request body", 
          details: parseError.message,
          success: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Get necessary environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const apiKey = Deno.env.get("GOOGLE_API_KEY") || "";
    
    if (!apiKey) {
      console.error("Missing API key: GOOGLE_API_KEY");
      return new Response(
        JSON.stringify({ 
          error: "Missing API key: GOOGLE_API_KEY", 
          success: false 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase credentials:", {
        url: !!supabaseUrl,
        serviceKey: !!supabaseServiceKey
      });
      return new Response(
        JSON.stringify({ 
          error: "Missing Supabase credentials", 
          success: false 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Extract all possible parameter names for consistency
    const { 
      bookContent, 
      userQuestion, 
      conversationId, 
      user,
      user_id,
      userId, 
      mode = "chat",
      bookId,
      book_id,
      pageNumber,
      endpoint,
      file_path
    } = requestBody || {};

    // Always use consistent parameter names
    const effectiveBookId = book_id || bookId;
    const effectiveUserId = user_id || userId || (user?.id);

    console.log("Extracted parameters:", {
      endpoint,
      mode,
      book_id: effectiveBookId,
      user_id: effectiveUserId,
      file_path,
      conversationId: !!conversationId,
      userQuestion: !!userQuestion,
      bookContent: !!bookContent
    });

    // Add health check endpoint
    if (endpoint === 'health-check') {
      console.log("Health check request received");
      const envCheck = {
        apiKey: !!apiKey,
        supabaseUrl: !!supabaseUrl,
        supabaseServiceKey: !!supabaseServiceKey
      };
      
      return new Response(
        JSON.stringify({ 
          status: "ok", 
          message: "Edge Function is running", 
          env: envCheck,
          timestamp: new Date().toISOString()
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle book processing endpoint
    if (endpoint === 'extract-pdf-text') {
      console.log("Processing book:", effectiveBookId);
      
      // Validate required parameters
      if (!effectiveBookId) {
        console.error("Missing book_id parameter");
        return new Response(
          JSON.stringify({ 
            error: "Missing required parameter: book_id", 
            success: false 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (!effectiveUserId) {
        console.error("Missing user_id parameter");
        return new Response(
          JSON.stringify({ 
            error: "Missing required parameter: user_id", 
            success: false 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (!file_path) {
        console.error("Missing file_path parameter");
        return new Response(
          JSON.stringify({ 
            error: "Missing required parameter: file_path", 
            success: false 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      try {
        // Update book status to indicate processing has started
        await supabase
          .from('books')
          .update({ 
            is_processed: false,
            processing_status: 'Downloading PDF...' 
          })
          .eq('id', effectiveBookId);
        
        // Download the PDF from storage
        const { data, error } = await supabase.storage
          .from('books')
          .download(file_path);
        
        if (error) {
          console.error("Error downloading PDF:", error);
          throw new Error(`Error downloading file: ${error.message}`);
        }
        
        if (!data) {
          console.error("No data returned from storage");
          throw new Error("No data returned from storage");
        }
        
        console.log("Successfully downloaded PDF, starting processing");
        
        // Process the PDF
        const pdfBytes = await data.arrayBuffer();
        const result = await processPdf(pdfBytes, effectiveBookId, effectiveUserId, supabase, apiKey);
        
        return new Response(
          JSON.stringify({ 
            success: result.success,
            pages: result.pages,
            chunks: result.chunks,
            message: result.success ? 
              `Successfully processed ${result.pages} pages and created ${result.chunks} chunks` :
              result.message
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        console.error("Error processing PDF:", error);
        
        // Update book with the error
        try {
          await supabase
            .from('books')
            .update({ 
              is_processed: false,
              processing_status: `Error: ${error.message || "Unknown error"}` 
            })
            .eq('id', effectiveBookId);
        } catch (statusError) {
          console.error("Failed to update error status:", statusError);
        }
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: error.message || "Error processing PDF" 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    
    // Handle standard chat responses
    // Default mode is chat if not specified
    let systemPrompt = chatSystemPrompt;
    let userPrompt = "";
  
    // Variables for context
    let contextText = "";
    let usedRag = false;
    let bookTitle = "";
    
    // If we have a bookId, try to get the book title
    if (effectiveBookId) {
      try {
        const { data: book } = await supabase
          .from('books')
          .select("title")
          .eq("id", effectiveBookId)
          .single();
        
        if (book) {
          bookTitle = book.title;
        }
      } catch (error) {
        console.error("Error fetching book title:", error);
        // Continue without book title
      }
    }
    
    // Get relevant chunks if needed for chat or quiz
    if (effectiveBookId && (mode === "chat" || mode === "quiz")) {
      const searchQuery = mode === "chat" ? userQuestion : "key concepts and important information";
      contextText = await findRelevantChunks(searchQuery, effectiveBookId, pageNumber, supabase, apiKey);
      usedRag = !!contextText;
    }
    
    // Process based on mode
    switch (mode) {
      case "chat":
        // Create a more detailed system prompt
        const pageContext = pageNumber ? `The user is currently viewing page ${pageNumber}${bookTitle ? ` of the book titled "${bookTitle}"` : ''}.` : '';
        systemPrompt = chatSystemPrompt + (pageContext ? `\n\n${pageContext}` : '');
        
        // Add clarity on using RAG content
        systemPrompt += `\n\nWhen provided with excerpts from the book, only use information from those excerpts to answer. Don't make up information that isn't in the excerpts. If the excerpts don't contain the answer, say so clearly and suggest what might help.`;
        
        // Create user prompt
        if (contextText) {
          userPrompt = `I'll provide you with relevant excerpts from the book that match the user's question. Your job is to answer based ONLY on these excerpts:\n\n${contextText}\n\nUser's question: ${userQuestion}\n\nProvide a clear, direct answer that addresses the question specifically using information from these excerpts. If the answer isn't found in the excerpts, acknowledge that and suggest what might help. Be conversational but avoid unnecessary commentary.`;
        } else {
          userPrompt = `Here is text content from page ${pageNumber}${bookTitle ? ` of "${bookTitle}"` : ''}:\n\n"""${bookContent}"""\n\nUser's question: ${userQuestion}\n\nBased ONLY on the provided page content, answer the question directly and concisely. If the answer isn't in this text, acknowledge that limitation clearly.`;
        }
        
        // Add page reference
        if (pageNumber) {
          userPrompt += `\n\nNote: This answer is based on content from page ${pageNumber}${bookTitle ? ` of "${bookTitle}"` : ''}.`;
        }
        break;
      
      case "quiz":
        // Add page number context
        const quizPageContext = pageNumber ? `Generate questions based on content from page ${pageNumber}${bookTitle ? ` of the book titled "${bookTitle}"` : ''}.` : '';
        systemPrompt = quizSystemPrompt + (quizPageContext ? `\n\n${quizPageContext}` : '');
        
        // Enhance with RAG context if available
        userPrompt = `Here is the text content from page ${pageNumber}${bookTitle ? ` of "${bookTitle}"` : ''} to generate quiz questions about:\n"""${contextText || bookContent}"""\n\nGenerate ${3} multiple-choice questions based ONLY on this text from page ${pageNumber}.
Ensure each question has a clear correct answer that can be found in or directly inferred from the text.`;
        
        // Add page reference
        if (pageNumber) {
          userPrompt += `\n\nNote: This quiz is based on content from page ${pageNumber}${bookTitle ? ` of "${bookTitle}"` : ''}.`;
        }
        break;
      
      case "quizEvaluation":
        systemPrompt = quizEvalSystemPrompt;
        
        // This should extract these from the request body
        const { question, options, correctIndex, userAnswerIndex } = requestBody;
        
        if (!question || !options || correctIndex === undefined || userAnswerIndex === undefined) {
          throw new Error("Missing quiz evaluation parameters");
        }
        
        userPrompt = `Question: ${question}\n\nOptions:\n${options.map((opt: string, i: number) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n')}\n\nCorrect Answer: ${String.fromCharCode(65 + correctIndex)} (${options[correctIndex]})\nUser's Answer: ${String.fromCharCode(65 + userAnswerIndex)} (${options[userAnswerIndex]})\n\nText Content:\n"""${bookContent}"""\n\n${userAnswerIndex === correctIndex ? "The answer is CORRECT. " : "The answer is INCORRECT. "}Please provide detailed feedback on the user's answer.`;
        
        // Add page reference
        if (pageNumber) {
          userPrompt += `\n\nNote: This question is based on content from page ${pageNumber}${bookTitle ? ` of "${bookTitle}"` : ''}.`;
        }
        break;
      
      default:
        throw new Error(`Unsupported mode: ${mode}`);
    }
    
    console.log("Calling Google Gemini API...");
    
    // Call Google Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: systemPrompt }] },
          { role: "model", parts: [{ text: "I understand. I'll act as an AI assistant for book readers as instructed." }] },
          { role: "user", parts: [{ text: userPrompt }] }
        ],
        generationConfig: {
          temperature: mode === "quiz" ? 0.7 : 0.3,
          maxOutputTokens: 1024,
        },
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error("Google Gemini API error:", errorData);
      throw new Error(`Google Gemini API error: ${errorData}`);
    }
    
    const result = await response.json();
    const aiResponse = result.candidates[0].content.parts[0].text;
    
    // Save message in database if this is a chat with conversation ID
    if (mode === "chat" && conversationId && effectiveUserId) {
      try {
        await supabase.from('ai_messages').insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: aiResponse,
        });
      } catch (dbError) {
        console.error("Error saving message to database:", dbError);
        // Continue despite database error
      }
    }
    
    // Return the AI response
    return new Response(
      JSON.stringify({
        response: aiResponse,
        context_used: usedRag,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("Error in AI assistant function:", error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "An unknown error occurred", 
        success: false
      }),
      { 
        status: 200, // Always return 200 to avoid CORS issues, client will handle the error
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
