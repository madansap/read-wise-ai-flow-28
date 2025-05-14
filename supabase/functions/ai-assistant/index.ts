
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
import * as pdfjs from "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/+esm";

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
    if (typeof pdfjs !== 'undefined' && pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
      console.log("PDF.js worker initialized successfully");
    } else {
      console.error("PDF.js not properly loaded");
    }
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
  googleApiKey: string
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
              console.error(`Error extracting text from page ${i+1}:`, pageError);
              return null;
            }
          })());
        }
        
        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Filter out nulls and add to main arrays
        for (const result of batchResults) {
          if (result) {
            pageTexts.push(result.pageText);
            pageIds.push(result.pageId);
            pageInserts.push(result.pageInsert);
          }
        }
        
        // Give a small delay between batches to prevent resource exhaustion
        if (batchEnd < pdf.numPages) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      if (pageInserts.length === 0) {
        throw new Error("Failed to extract text from any pages");
      }
      
      console.log(`Inserting ${pageInserts.length} pages into database`);
      
      // Insert pages in batches to avoid request size limits
      const DB_BATCH_SIZE = 10;
      for (let i = 0; i < pageInserts.length; i += DB_BATCH_SIZE) {
        const batch = pageInserts.slice(i, i + DB_BATCH_SIZE);
        const { error: pageError } = await supabase.from('book_pages').insert(batch);
        
        if (pageError) {
          console.error(`Error inserting pages batch ${i}-${i+batch.length}:`, pageError);
          // Continue with other batches, but log the specific error
        }
        
        // Small delay between batch inserts
        if (i + DB_BATCH_SIZE < pageInserts.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      // Process chunks and embeddings
      await supabase
        .from('books')
        .update({ 
          processing_status: 'Creating semantic chunks and embeddings...' 
        })
        .eq('id', bookId);
      
      let totalChunks = 0;
      
      // Process page content in smaller batches
      const EMBEDDING_BATCH_SIZE = 3; // Process 3 pages at a time for embeddings
      
      for (let i = 0; i < pageIds.length; i += EMBEDDING_BATCH_SIZE) {
        const batchEnd = Math.min(i + EMBEDDING_BATCH_SIZE, pageIds.length);
        
        // Update status
        await supabase
          .from('books')
          .update({ 
            processing_status: `Creating embeddings: page ${i + 1} of ${pageIds.length}` 
          })
          .eq('id', bookId);
        
        // Process pages in current batch
        const pagePromises = [];
        
        for (let j = i; j < batchEnd; j++) {
          pagePromises.push((async () => {
            try {
              const pageId = pageIds[j];
              const pageContent = pageTexts[j] || "";
              const chunks = createChunks(pageContent);
              
              // Process chunks in smaller batches
              const CHUNK_BATCH_SIZE = 3;
              let pageChunksAdded = 0;
              
              for (let k = 0; k < chunks.length; k += CHUNK_BATCH_SIZE) {
                const chunkBatchEnd = Math.min(k + CHUNK_BATCH_SIZE, chunks.length);
                const chunkPromises = [];
                
                for (let l = k; l < chunkBatchEnd; l++) {
                  const chunk = chunks[l];
                  
                  if (chunk.trim().length < 10) continue; // Skip empty chunks
                  
                  chunkPromises.push((async () => {
                    try {
                      const embedding = await getEmbedding(chunk, googleApiKey);
                      
                      return supabase.from('book_chunks').insert({
                        book_id: bookId,
                        page_id: pageId,
                        chunk_index: l,
                        content: chunk,
                        embedding
                      });
                    } catch (chunkError) {
                      console.error(`Error processing chunk ${l} for page ${j+1}:`, chunkError);
                      
                      // Retry once with exponential backoff
                      await new Promise(resolve => setTimeout(resolve, 2000));
                      
                      try {
                        const embedding = await getEmbedding(chunk, googleApiKey);
                      
                        return supabase.from('book_chunks').insert({
                          book_id: bookId,
                          page_id: pageId,
                          chunk_index: l,
                          content: chunk,
                          embedding
                        });
                      } catch (retryError) {
                        console.error(`Retry failed for chunk ${l} for page ${j+1}:`, retryError);
                        return null;
                      }
                    }
                  })());
                }
                
                // Wait for chunk batch to complete
                const results = await Promise.all(chunkPromises);
                const successfulChunks = results.filter(r => r !== null).length;
                pageChunksAdded += successfulChunks;
                
                // Small delay between chunk batches
                if (k + CHUNK_BATCH_SIZE < chunks.length) {
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
              }
              
              return pageChunksAdded;
            } catch (pageError) {
              console.error(`Error processing page ${j+1}:`, pageError);
              return 0;
            }
          })());
        }
        
        // Wait for page batch to complete
        const pageResults = await Promise.all(pagePromises);
        const batchChunks = pageResults.reduce((sum, count) => sum + (count || 0), 0);
        totalChunks += batchChunks;
        
        // Small delay between page batches
        if (i + EMBEDDING_BATCH_SIZE < pageIds.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      console.log(`Processing complete. Total chunks: ${totalChunks}`);
      
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
      
    } catch (pdfError: any) {
      console.error("PDF parsing error:", pdfError);
      
      // Update book with the specific error status
      await supabase
        .from('books')
        .update({ 
          is_processed: false,
          processing_status: `Error: ${pdfError.message || 'Unknown PDF parsing error'}` 
        })
        .eq('id', bookId);
      
      throw new Error(`PDF parsing error: ${pdfError.message || 'Unknown error'}`);
    }
    
  } catch (error: any) {
    console.error("PDF processing error:", error);
    
    // Update book with error status
    try {
      await supabase
        .from('books')
        .update({ 
          is_processed: false,
          processing_status: `Error: ${error.message || 'Unknown processing error'}` 
        })
        .eq('id', bookId);
    } catch (updateError) {
      console.error("Failed to update error status:", updateError);
    }
    
    return { 
      success: false, 
      pages: 0,
      chunks: 0,
      message: error.message || "Unknown processing error"
    };
  }
}

// Semantic search to find relevant chunks
async function findRelevantChunks(
  query: string, 
  bookId: string,
  pageNumber: number | null,
  supabase: any, 
  googleApiKey: string,
  limit: number = MAX_CONTEXT_CHUNKS
): Promise<string> {
  try {
    console.log("Finding relevant chunks for query:", query);
    
    // Get embedding for the query
    const queryEmbedding = await getEmbedding(query, googleApiKey);
    
    // Search for relevant chunks using vector similarity
    const { data: chunks, error } = await supabase
      .rpc('match_book_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: limit,
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
    
    // Get metadata for the chunks (page numbers, etc.)
    const enhancedChunks = await Promise.all(
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
    
    // Sort by similarity (highest first)
    enhancedChunks.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    
    // Format the chunks with metadata
    const contextText = enhancedChunks
      .slice(0, limit)
      .map((chunk, index) => 
        `[EXCERPT ${index + 1} | Page ${chunk.page_number}]\n${chunk.content}\n[END EXCERPT ${index + 1}]`
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
    // Get necessary environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const googleApiKey = Deno.env.get("OPENAI_API_KEY") || "";
    
    if (!googleApiKey) {
      throw new Error("Missing API key");
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse request body
    const { 
      bookContent, 
      userQuestion, 
      conversationId, 
      user, 
      mode = "chat",
      bookId,
      pageNumber,
      endpoint,
      file_path,
      user_id
    } = await req.json();

    // Handle book processing endpoint
    if (endpoint === 'extract-pdf-text') {
      console.log("Processing book:", bookId);
      
      if (!bookId || !user_id || !file_path) {
        return new Response(
          JSON.stringify({ 
            error: "Missing required fields for book processing", 
            success: false 
          }),
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
        .eq('id', bookId);
      
      // Download the PDF from storage
      const { data, error } = await supabase.storage.from('books').download(file_path);
      
      if (error || !data) {
        console.error("Failed to download PDF:", error);
        
        await supabase
          .from('books')
          .update({ 
            is_processed: false,
            processing_status: `Error: Failed to download PDF: ${error?.message || 'Unknown error'}` 
          })
          .eq('id', bookId);
        
        return new Response(
          JSON.stringify({ 
            error: `Failed to download PDF: ${error?.message || 'Unknown error'}`,
            success: false
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Process the PDF
      const pdfBytes = await data.arrayBuffer();
      const result = await processPdf(pdfBytes, bookId, user_id, supabase, googleApiKey);
      
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // For chat and quiz modes, we need content
    if ((mode === "chat" || mode === "quiz") && !bookContent && !bookId) {
      throw new Error("Book content or book ID is required");
    }
    
    // For chat mode, we also need a user question
    if (mode === "chat" && !userQuestion) {
      throw new Error("User question is required for chat mode");
    }
    
    // Variables for context
    let contextText = "";
    let usedRag = false;
    let bookTitle = null;
    
    // If bookId is provided for chat or quiz, get context using RAG
    if (bookId && (mode === "chat" || mode === "quiz")) {
      const searchQuery = mode === "chat" ? userQuestion : "key concepts and important information";
      contextText = await findRelevantChunks(searchQuery, bookId, pageNumber, supabase, googleApiKey);
      usedRag = !!contextText;
      
      // Get book title for context
      try {
        const { data: book } = await supabase
          .from('books')
          .select('title')
          .eq('id', bookId)
          .single();
        
        bookTitle = book?.title || null;
      } catch (error) {
        console.error("Error getting book title:", error);
      }
    }
    
    // Use OpenAI API to generate response
    let systemPrompt;
    let userPrompt;
    
    switch (mode) {
      case "chat":
        systemPrompt = chatSystemPrompt;
        
        // If we have context from RAG, use it instead of the provided bookContent
        const effectiveBookContent = contextText || bookContent;
        
        // Add page number context to the system prompt
        const pageContext = pageNumber ? `The user is currently viewing page ${pageNumber}${bookTitle ? ` of the book titled "${bookTitle}"` : ''}.` : '';
        const enhancedSystemPrompt = systemPrompt + (pageContext ? `\n\n${pageContext}` : '');
        
        // Create user prompt
        if (contextText) {
          userPrompt = `I need you to answer based on the following relevant sections from the book. These excerpts were retrieved based on their semantic relevance to the user's question:\n\n${contextText}\n\nUser's question: ${userQuestion}\n\nPlease note that the user is currently on page ${pageNumber}${bookTitle ? ` of "${bookTitle}"` : ''}. Provide a detailed, helpful answer based specifically on the content in these excerpts. If the excerpts contain the necessary information, use it to give a complete answer.`;
        } else {
          userPrompt = `Book Text from Page ${pageNumber}${bookTitle ? ` of "${bookTitle}"` : ''}:\n"""${bookContent}"""\n\nUser's Question/Request: "${userQuestion}"\n\nBased ONLY on the "Book Text" provided above from page ${pageNumber}, please address the user's question/request.`;
        }
        break;
      
      case "quiz":
        systemPrompt = quizSystemPrompt;
        
        // Add page number context
        const quizPageContext = pageNumber ? `Generate questions based on content from page ${pageNumber}${bookTitle ? ` of the book titled "${bookTitle}"` : ''}.` : '';
        const enhancedQuizSystemPrompt = systemPrompt + (quizPageContext ? `\n\n${quizPageContext}` : '');
        systemPrompt = enhancedQuizSystemPrompt;
        
        // Enhance with RAG context if available
        userPrompt = `Here is the text content from page ${pageNumber}${bookTitle ? ` of "${bookTitle}"` : ''} to generate quiz questions about:\n"""${contextText || bookContent}"""\n\nGenerate ${3} multiple-choice questions based ONLY on this text from page ${pageNumber}.
Ensure each question has a clear correct answer that can be found in or directly inferred from the text.`;
        break;
      
      case "quizEvaluation":
        systemPrompt = quizEvalSystemPrompt;
        
        // This should extract these from the request body
        const { question, options, correctIndex, userAnswerIndex } = req.body?.quizEvaluation || {};
        
        userPrompt = quizEvalUserPromptTemplate(
          bookContent, 
          question, 
          options, 
          correctIndex, 
          userAnswerIndex
        );
        
        // Add page reference
        if (pageNumber) {
          userPrompt += `\n\nNote: This question is based on content from page ${pageNumber}${bookTitle ? ` of "${bookTitle}"` : ''}.`;
        }
        break;
      
      default:
        throw new Error(`Unsupported mode: ${mode}`);
    }
    
    // Call the OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${googleApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Using gpt-4o-mini for better cost efficiency
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: mode === "quiz" ? 0.7 : 0.3,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error("OpenAI API error:", errorData);
      throw new Error(`OpenAI API error: ${errorData}`);
    }
    
    const result = await response.json();
    const aiResponse = result.choices[0].message.content;
    
    // Save message in database if this is a chat with conversation ID
    if (mode === "chat" && conversationId && user) {
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
