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
  openaiApiKey: string
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
      const pageInserts: BookPage[] = [];
      
      // Process in smaller batches to avoid memory issues
      const BATCH_SIZE = 5; // Process 5 pages at a time
      
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
      
      // Check if the book_pages table exists by attempting a lightweight query
      try {
        const { data: tableCheck, error: tableError } = await supabase
          .from('book_pages')
          .select('id')
          .limit(1);
          
        if (tableError) {
          console.error("Error checking book_pages table:", tableError);
          throw new Error(`Database table error: ${tableError.message}`);
        }
      } catch (tableCheckError) {
        console.error("Failed to query book_pages table:", tableCheckError);
        throw new Error("Database table 'book_pages' may not exist or is inaccessible");
      }
      
      // Insert pages in batches to avoid request size limits
      const DB_BATCH_SIZE = 10;
      for (let i = 0; i < pageInserts.length; i += DB_BATCH_SIZE) {
        const batch = pageInserts.slice(i, i + DB_BATCH_SIZE);
        const { error: pageError } = await supabase.from('book_pages').insert(batch);
        
        if (pageError) {
          console.error(`Error inserting pages batch ${i}-${i+batch.length}:`, pageError);
          // Continue with other batches, but log the specific error
          if (pageError.message?.includes("column") || pageError.message?.includes("does not exist")) {
            throw new Error(`Database schema error: ${pageError.message}`);
          }
        }
        
        // Small delay between batch inserts
        if (i + DB_BATCH_SIZE < pageInserts.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      // Check if the book_chunks table exists with vector support
      try {
        const { error: chunkCheckError } = await supabase.rpc(
          'match_book_chunks',
          {
            query_embedding: Array(768).fill(0),
            match_threshold: 0.5,
            match_count: 1,
            p_book_id: bookId
          }
        );
        
        if (chunkCheckError && (
          chunkCheckError.message?.includes("function") || 
          chunkCheckError.message?.includes("does not exist") ||
          chunkCheckError.message?.includes("vector")
        )) {
          console.error("Vector function check failed:", chunkCheckError);
          throw new Error(`Vector extension error: ${chunkCheckError.message}`);
        }
      } catch (vectorError) {
        console.error("Failed to use vector functionality:", vectorError);
        throw new Error("Vector extension may not be properly installed");
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
                      const embedding = await getEmbedding(chunk, openaiApiKey);
                      
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
                        const embedding = await getEmbedding(chunk, openaiApiKey);
                      
                        return supabase.from('book_chunks').insert({
                          book_id: bookId,
                          page_id: pageId,
                          chunk_index: l,
                          content: chunk,
                          embedding
                        });
                      } catch (retryError: any) {
                        console.error(`Retry failed for chunk ${l} for page ${j+1}:`, retryError);
                        
                        // Check for specific vector-related errors
                        if (retryError.message?.includes("vector") || retryError.message?.includes("column")) {
                          throw new Error(`Vector column error: ${retryError.message}`);
                        }
                        
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
            } catch (pageError: any) {
              console.error(`Error processing page ${j+1}:`, pageError);
              
              // If this is a database schema error, propagate it up
              if (pageError.message?.includes("vector") || 
                  pageError.message?.includes("column") || 
                  pageError.message?.includes("does not exist")) {
                throw pageError;
              }
              
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
      
      // Check for specific types of errors
      let errorMessage = pdfError.message || "Unknown error";
      let errorType = "parsing";
      
      if (errorMessage.includes("vector") || errorMessage.includes("extension")) {
        errorType = "vector";
      } else if (errorMessage.includes("column") || errorMessage.includes("does not exist") || errorMessage.includes("table")) {
        errorType = "database";
      }
      
      // Update book with the specific error status
      await supabase
        .from('books')
        .update({ 
          is_processed: false,
          processing_status: `Error (${errorType}): ${errorMessage}` 
        })
        .eq('id', bookId);
      
      throw new Error(`PDF ${errorType} error: ${errorMessage}`);
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
    
    // Return a structured error response instead of throwing
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
  openaiApiKey: string,
  limit: number = MAX_CONTEXT_CHUNKS
): Promise<string> {
  try {
    // Reformulate the query to improve search effectiveness
    const searchQuery = await reformulateQuery(query, openaiApiKey);
    console.log("Original query:", query);
    console.log("Reformulated query:", searchQuery);
    
    // Get embedding for the improved query
    const queryEmbedding = await getEmbedding(searchQuery, openaiApiKey);
    
    // Build the search query with optimized similarity threshold
    let matchQuery = supabase
      .rpc('match_book_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: 0.25, // Optimized threshold for better recall
        match_count: limit * 3, // Get more candidates for better filtering
        p_book_id: bookId
      });
    
    // If page number is provided, create a second query focused on the current and adjacent pages
    let pageMatchQuery = null;
    let pageMatches: any[] = [];
    let usePageContext = false; // Flag to track if we're using page-specific context
    
    if (pageNumber !== null) {
      // Get wider range of nearby pages (2 pages in each direction)
      const { data: adjacentPages } = await supabase
        .from('book_pages')
        .select('id')
        .eq('book_id', bookId)
        .gte('page_number', Math.max(1, pageNumber - 2))
        .lte('page_number', pageNumber + 2);
      
      if (adjacentPages && adjacentPages.length > 0) {
        usePageContext = true;
        const pageIds = adjacentPages.map((p: any) => p.id);
        
        // Create a separate query for page-specific matches with higher limit
        pageMatchQuery = supabase
          .rpc('match_book_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: 0.2, // Lower threshold for page-specific content
            match_count: limit * 2, 
            p_book_id: bookId
          })
          .in('page_id', pageIds);
        
        // Execute the page-specific query
        if (pageMatchQuery) {
          const { data: pageResults } = await pageMatchQuery;
          if (pageResults && pageResults.length > 0) {
            pageMatches = pageResults;
          }
        }
      }
    }
    
    // Execute the global search query
    const { data: chunks, error } = await matchQuery;
    
    if (error) {
      console.error("Error searching for chunks:", error);
      return "";
    }
    
    // Try with alternative queries if needed
    let alternativeChunks: any[] = [];
    
    // If original query is significantly different from reformulated query, 
    // also try with the original query as a fallback to capture direct quotes
    if ((!chunks || chunks.length < 2) && query !== searchQuery && query.length > 10) {
      console.log("Using original query as fallback");
      const originalEmbedding = await getEmbedding(query, openaiApiKey);
      const { data: originalChunks } = await supabase
        .rpc('match_book_chunks', {
          query_embedding: originalEmbedding,
          match_threshold: 0.2,
          match_count: limit,
          p_book_id: bookId
        });
      
      if (originalChunks && originalChunks.length > 0) {
        alternativeChunks = originalChunks;
      }
    }
    
    // Try keyword search for query terms if semantic search returned few results
    if ((!chunks || chunks.length < 2) && (!alternativeChunks || alternativeChunks.length < 2)) {
      console.log("Trying keyword-based fallback");
      // Extract keywords from query
      const keywords = query.split(/\s+/)
        .filter(word => word.length > 4) // Only use substantial words
        .map(word => word.replace(/[^\w]/g, '')); // Remove punctuation
      
      if (keywords.length > 0) {
        // Use ilike queries for each keyword
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
        const flatResults = keywordResults.flat();
        
        if (flatResults.length > 0) {
          // Add similarity score (arbitrary for keyword results)
          alternativeChunks.push(...flatResults.map((chunk: any) => ({
            ...chunk,
            similarity: 0.5 // Arbitrary score for keyword matches
          })));
        }
      }
    }
    
    // Combine all results
    let allChunks = [
      ...(chunks || []), 
      ...pageMatches,
      ...alternativeChunks
    ];
    
    if (!allChunks || allChunks.length === 0) {
      return "";
    }
    
    // Deduplicate chunks based on id
    const uniqueChunks = Array.from(
      new Map(allChunks.map(chunk => [chunk.id, chunk])).values()
    );
    
    // Sort by similarity
    uniqueChunks.sort((a, b) => b.similarity - a.similarity);
    
    // Select diverse chunks across different pages when possible
    const selectedChunks = selectDiverseChunks(uniqueChunks, limit, usePageContext);
    
    // Get metadata for the chunks (page numbers, etc.)
    const enhancedChunks = await Promise.all(
      selectedChunks.map(async (chunk) => {
        if (!chunk) return null;
        
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
    
    // Filter out nulls and sort by page number for better context flow
    const filteredChunks = enhancedChunks.filter(c => c !== null) as SearchResult[];
    filteredChunks.sort((a, b) => (a.page_number || 0) - (b.page_number || 0));
    
    // Format the chunks with metadata in a way that's helpful for the LLM
    const contextText = filteredChunks
      .map((chunk, index) => 
        `[EXCERPT ${index + 1} | Page ${chunk.page_number}]\n${chunk.content}\n[END EXCERPT ${index + 1}]`
      )
      .join('\n\n');
    
    return contextText;
  } catch (error) {
    console.error("Error in findRelevantChunks:", error);
    return "";
  }
}

// Helper function to select diverse chunks across different pages
function selectDiverseChunks(chunks: any[], limit: number, usePageContext: boolean): any[] {
  if (!chunks || chunks.length === 0) return [];
  if (chunks.length <= limit) return chunks;
  
  const selected: any[] = [];
  const seenPages = new Set<string>();
  
  // First pass: take top chunk from each page until we reach the limit
  for (const chunk of chunks) {
    if (selected.length >= limit) break;
    if (!chunk || !chunk.page_id) continue;
    
    // If we haven't seen this page yet, add its top chunk
    if (!seenPages.has(chunk.page_id)) {
      selected.push(chunk);
      seenPages.add(chunk.page_id);
    }
  }
  
  // Second pass: if we haven't filled our quota, take remaining top chunks
  if (selected.length < limit) {
    // Get chunks we haven't selected yet
    const remaining = chunks.filter(chunk => 
      chunk && chunk.id && !selected.some(s => s.id === chunk.id)
    );
    
    // Add them until we reach the limit
    for (const chunk of remaining) {
      if (selected.length >= limit) break;
      selected.push(chunk);
    }
  }
  
  return selected;
}

// Reformulate query to improve embedding search
async function reformulateQuery(query: string, apiKey: string): Promise<string> {
  // Skip reformulation for very short queries or selections
  if (query.length < 15) return query;
  
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=" + apiKey, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          { 
            role: "user",
            parts: [
              {
                text: "Your task is to reformulate the user's query to optimize it for semantic search. Identify important concepts, entities, and keywords. Include synonyms of key terms. For questions, rephrase to focus on the central information need. For text selections, extract key concepts. Return a concise, search-optimized version with all relevant terms.\n\nQuery: " + query
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 150,
        },
      }),
    });
    
    if (!response.ok) {
      // If fails, return original query
      console.error("Reformulation API error:", await response.text());
      return query;
    }
    
    const data = await response.json();
    const reformulatedQuery = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    return reformulatedQuery || query;
  } catch (error) {
    // In case of error, return original query
    console.error("Error reformulating query:", error);
    return query;
  }
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
  const googleApiKey = Deno.env.get("GOOGLE_API_KEY") || "AIzaSyBg_jyEFuo9xhWg8Toyb5MP0trPdVw5Fis";
  const openaiApiKey = googleApiKey; // Use Google API key (keeping variable name for less code changes)
  
  // PDF Processing can be called either through the dedicated path or through the endpoint parameter
  if (path === "/extract-pdf-text" && req.method === "POST" || path === "/" && req.method === "POST") {
    try {
      const requestBody = await req.json();
      
      // Handle PDF extraction either directly or through the endpoint parameter
      if (path === "/extract-pdf-text" || requestBody.endpoint === 'extract-pdf-text') {
        // Get parameters from the request body
        const { book_id, user_id, file_path } = requestBody;
        
        if (!book_id || !user_id || !file_path) {
          console.error("Missing required fields:", { book_id, user_id, file_path });
          return new Response(
            JSON.stringify({ 
              error: "Missing required fields",
              success: false
            }), 
            { 
              status: 400, 
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
            }
          );
        }
        
        // Update book processing status
        try {
          await supabase
            .from('books')
            .update({ 
              is_processed: false,
              processing_status: 'Downloading PDF...' 
            })
            .eq('id', book_id);
        } catch (updateError) {
          console.error("Error updating book status:", updateError);
          // Continue despite the error
        }
        
        // Download the PDF from Supabase Storage
        const { data, error } = await supabase.storage.from('books').download(file_path);
        
        if (error || !data) {
          console.error("Failed to download PDF:", error);
          
          // Update book with error status
          try {
            await supabase
              .from('books')
              .update({ 
                is_processed: false,
                processing_status: `Error: Failed to download PDF: ${error?.message || 'Unknown error'}` 
              })
              .eq('id', book_id);
          } catch (statusError) {
            console.error("Failed to update error status:", statusError);
          }
          
          return new Response(
            JSON.stringify({ 
              error: `Failed to download PDF: ${error?.message || 'Unknown error'}`,
              success: false
            }), 
            { 
              status: 500, 
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
            }
          );
        }
        
        // Process the PDF
        const pdfBytes = await data.arrayBuffer();
        
        // Update status
        try {
          await supabase
            .from('books')
            .update({ processing_status: 'Extracting text and creating embeddings...' })
            .eq('id', book_id);
        } catch (updateError) {
          console.error("Error updating book status:", updateError);
          // Continue despite the error
        }
        
        try {
          // Process the PDF (extract text, create chunks, generate embeddings)
          const result = await processPdf(pdfBytes, book_id, user_id, supabase, openaiApiKey);
          
          // Ensure we're returning a 200 status
          return new Response(
            JSON.stringify({ 
              ...result,
              success: true
            }), 
            { 
              status: 200, 
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
            }
          );
        } catch (processingError: any) {
          console.error("PDF processing error:", processingError);
          
          // Try to update book status
          try {
            await supabase
              .from('books')
              .update({ 
                is_processed: false,
                processing_status: `Error: ${processingError.message || 'Unknown processing error'}` 
              })
              .eq('id', book_id);
          } catch (statusError) {
            console.error("Failed to update error status:", statusError);
          }
          
          // Always return a 200 response even for errors, to avoid client-side issues
          // The success: false will indicate to the client that there was a problem
          return new Response(
            JSON.stringify({ 
              error: "PDF processing failed", 
              message: processingError.message || "Unknown error",
              success: false
            }), 
            { 
              status: 200, 
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
            }
          );
        }
      }
      
      // If we reach here, it's a standard AI assistant request
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
      let usedRag = false;
      
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
          usedRag = !!contextText;
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
            usedRag = true;
          }
        }
      }
      
      // Normal processing continues
      let systemPrompt;
      let userPrompt;
      let temperature = 0.3;
      
      switch (mode) {
        case "chat":
          systemPrompt = chatSystemPrompt;
          
          // If we have context from RAG, use it instead of the provided bookContent
          const effectiveBookContent = contextText || bookContent || "";
          userPrompt = chatUserPromptTemplate(effectiveBookContent, userQuestion);
          
          // If using RAG context, modify the prompt to include the source
          if (contextText) {
            userPrompt = `I need you to answer based on the following relevant sections from the book. These excerpts were retrieved based on their semantic relevance to the user's question:\n\n${contextText}\n\nUser's question: ${userQuestion}\n\nProvide a detailed, helpful answer based specifically on the content in these excerpts. If the excerpts contain the necessary information, use it to give a complete answer. For any claims you make, indicate which excerpt supports that information (e.g., "As mentioned in excerpt 2..."). If the information in the excerpts isn't sufficient to completely answer the question, clearly state what's missing rather than making up an answer.`;
          }
          
          temperature = 0.3;
          break;
        
        case "quiz":
          systemPrompt = quizSystemPrompt;
          
          // Enhance quiz generation with RAG context
          if (contextText) {
            systemPrompt += "\n\nYou have been provided with key excerpts from the book that were selected based on importance and topic coverage. Base your quiz questions on these excerpts to ensure they are relevant and accurately reflect the book's content.";
          }
          
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
            userPrompt = `The user has selected this text to understand better:\n\n"""${selectedText}"""\n\nHere's the surrounding context from page ${pageNumber}:\n\n"""${selectedContext}"""\n\n${contextText ? `And here are the most relevant passages from other parts of the book that can help explain this selection:\n\n${contextText}\n\n` : ""}Please explain this selection clearly, referencing relevant context when helpful.`;
          } else if (selectedText) {
            // Fixed: Using correct number of arguments (just selectedText)
            userPrompt = explainSelectionUserPromptTemplate(selectedText);
          } else {
            userPrompt = "Please select some text to explain.";
          }
          temperature = 0.4;
          break;
      }
      
      // Format the response
      const responseText = `System Prompt: ${systemPrompt}\n\nUser Prompt: ${userPrompt}\n\nTemperature: ${temperature}`;
      
      return new Response(responseText, { status: 200, headers: corsHeaders });
    } catch (error: any) {
      console.error("Error processing request:", error);
      return new Response(
        JSON.stringify({ 
          error: "An error occurred while processing the request",
          message: error.message || "Unknown error" 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } else {
    return new Response(
      JSON.stringify({ error: "Invalid request path" }),
      { status: 400, headers: corsHeaders }
    );
  }
});