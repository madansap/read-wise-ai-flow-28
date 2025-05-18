
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.22.0";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Environment variables
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const googleApiKey = Deno.env.get("GOOGLE_API_KEY") || "";

// Check if required environment variables are present
if (!supabaseUrl) console.error("SUPABASE_URL is missing");
if (!supabaseServiceKey) console.error("SUPABASE_SERVICE_ROLE_KEY is missing");
if (!googleApiKey) console.error("GOOGLE_API_KEY is missing");

// Create a Supabase client with service role key for accessing protected data
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Function to find relevant chunks for a query using vector similarity search
async function findRelevantChunks(query: string, bookId: string, pageNumber?: number, searchScope: 'page' | 'book' = 'book') {
  console.log(`Finding relevant chunks for query: ${query} `);
  
  try {
    // If search scope is set to just the current page and we have a page number
    if (searchScope === 'page' && pageNumber) {
      console.log(`Looking up context for page ${pageNumber} of book ${bookId}`);
      
      // First get the page ID for the given page number
      const { data: pageData, error: pageError } = await supabase
        .from('book_pages')
        .select('id')
        .eq('book_id', bookId)
        .eq('page_number', pageNumber)
        .single();
        
      if (pageError || !pageData) {
        console.log(`No page found for book ${bookId} and page ${pageNumber}`);
        return [];
      }
      
      // Get chunks for this specific page
      const pageId = pageData.id;
      
      // Generate embeddings for the query using Google Gemini API
      const embedding = await generateEmbedding(query);
      if (!embedding) {
        throw new Error("Failed to generate embeddings for query");
      }
      
      // Use the match_page_chunks function to find chunks on this page
      const { data, error } = await supabase.rpc('match_page_chunks', {
        query_embedding: embedding,
        page_id_param: pageId,
        match_threshold: 0.5, // Lower threshold to get more results
        match_count: 5 // Limit to top 5 most relevant chunks
      });
      
      if (error) {
        console.log(`Vector search error: ${error.message}`);
        return [];
      }
      
      if (data && data.length > 0) {
        console.log(`Found ${data.length} vector matches on page ${pageNumber}`);
        return data;
      } else {
        console.log(`No vector matches found on page ${pageNumber}, falling back to full page content`);
        // If no specific chunks match, return the whole page content
        const { data: pageContentData, error: pageContentError } = await supabase
          .from('book_pages')
          .select('content')
          .eq('id', pageId)
          .single();
          
        if (pageContentError || !pageContentData?.content) {
          return [];
        }
        
        return [{
          id: pageId,
          content: pageContentData.content,
          similarity: 1.0
        }];
      }
    } else {
      // Book-wide search
      console.log(`Looking up context for the entire book with ID: ${bookId}`);
      
      // Generate embeddings for the query using Google Gemini API
      const embedding = await generateEmbedding(query);
      if (!embedding) {
        throw new Error("Failed to generate embeddings for query");
      }
      
      // Use the match_book_chunks function to find chunks across the whole book
      const { data, error } = await supabase.rpc('match_book_chunks', {
        query_embedding: embedding,
        match_threshold: 0.4, // Lower threshold for book-wide searches to capture more context
        match_count: 10, // Increase the number of chunks for full book context
        p_book_id: bookId
      });
      
      if (error) {
        console.log(`Vector search error: ${error.message}`);
        return [];
      }
      
      if (data && data.length > 0) {
        console.log(`Found ${data.length} vector matches across the book`);
        return data;
      } else {
        console.log(`No vector matches found, trying keyword search`);
        
        // Fallback to keyword search if vector search yields no results
        // Split query into keywords and search for them
        const keywords = query.trim().toLowerCase().split(/\s+/)
          .filter(word => word.length > 3) // Only use meaningful words
          .map(word => word.replace(/[^\w]/g, '')); // Remove special chars
          
        if (keywords.length === 0) {
          console.log(`No keywords found for search`);
          return [];
        }
        
        // Build a query to search for any of these keywords in the chunks
        const { data: keywordData, error: keywordError } = await supabase
          .from('book_chunks')
          .select('id, content, book_id, page_id')
          .eq('book_id', bookId)
          .or(keywords.map(keyword => `content.ilike.%${keyword}%`).join(','))
          .limit(10);
          
        if (keywordError || !keywordData || keywordData.length === 0) {
          console.log(`No chunks found with keyword search either`);
          return [];
        }
        
        console.log(`Found ${keywordData.length} chunks using keyword search`);
        return keywordData.map(chunk => ({
          ...chunk,
          similarity: 0.7 // Assign a default similarity score
        }));
      }
    }
  } catch (error) {
    console.error(`Error finding relevant chunks: ${error.message}`);
    return [];
  }
}

// Function to generate embeddings using Google AI
async function generateEmbedding(text: string) {
  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=" + googleApiKey;
    
    const payload = {
      model: "models/embedding-001",
      content: {
        parts: [{ text }]
      }
    };
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Google AI API error: ${response.status} - ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    return data.embedding.values;
  } catch (error) {
    console.error(`Error generating embedding: ${error.message}`);
    return null;
  }
}

// Function to call Gemini API for chat completions
async function callGeminiAPI(prompt: string, context: string, systemPrompt = "") {
  try {
    console.log("Calling Google Gemini API...");
    
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + googleApiKey;
    
    const messages = [];
    
    // Add system prompt if provided
    if (systemPrompt) {
      messages.push({
        role: "user",
        parts: [{ text: systemPrompt }]
      });
      
      messages.push({
        role: "model",
        parts: [{ text: "I understand and will respond accordingly." }]
      });
    }
    
    // Add context and user question
    const contextAndPrompt = context ? 
      `CONTEXT:\n${context}\n\nQUESTION:\n${prompt}\n\nAnswer based on the provided context only. If the question cannot be answered based on the context, say so.` : 
      prompt;
      
    messages.push({
      role: "user",
      parts: [{ text: contextAndPrompt }]
    });
    
    const payload = {
      contents: messages,
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 1024
      }
    };
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Google AI API error: ${response.status} - ${errorText}`);
      throw new Error(`Google AI API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error(`Error calling Gemini API: ${error.message}`);
    throw error;
  }
}

// Function to generate a quiz based on content
async function generateQuiz(content: string, relevantChunks: any[]) {
  const context = relevantChunks.map(chunk => chunk.content).join('\n\n');
  
  const systemPrompt = `You are a helpful teaching assistant that creates engaging quiz questions. 
  Generate 3 questions based on the provided content with multiple-choice answers. 
  Format your response as follows:
  
  Q1: [Question]
  A) [Option A]
  B) [Option B]
  C) [Option C]
  D) [Option D]
  
  Q2: [Question]
  ...
  
  ANSWERS:
  Q1: [Correct option letter]
  Q2: [Correct option letter]
  ...
  
  EXPLANATIONS:
  Q1: [Explanation of correct answer]
  Q2: [Explanation of correct answer]
  ...`;
  
  const prompt = "Create a quiz based on the following content.";
  
  return await callGeminiAPI(prompt, context, systemPrompt);
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Function triggered at: " + new Date().toISOString());
    console.log("Request headers:", req.headers);
    
    const reqBody = await req.text();
    console.log("Raw request body:", reqBody);
    
    let body;
    try {
      body = JSON.parse(reqBody);
      console.log("Parsed request body:", body);
    } catch (e) {
      console.error("Error parsing request body:", e);
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    // Check environment variables
    console.log(`GOOGLE_API_KEY exists: ${Boolean(googleApiKey)}`);
    console.log(`SUPABASE_URL exists: ${Boolean(supabaseUrl)}`);
    console.log(`SUPABASE_SERVICE_ROLE_KEY exists: ${Boolean(supabaseServiceKey)}`);
    
    // Extract parameters from request body
    const endpoint = body.endpoint;
    const mode = body.mode || 'chat';
    const bookId = body.bookId || body.book_id;
    const userId = body.userId || body.user_id;
    const filePath = body.filePath || body.file_path;
    const pageNumber = body.pageNumber;
    const conversationId = body.conversationId || false;
    const userQuestion = body.userQuestion || false;
    const bookContent = body.bookContent || false;
    const searchScope = body.searchScope || 'book'; // 'page' or 'book'
    
    console.log("Extracted parameters:", {
      endpoint,
      mode,
      bookId,
      userId,
      filePath,
      pageNumber,
      conversationId,
      userQuestion,
      bookContent,
      searchScope
    });
    
    // Handle chat/quiz modes
    if (mode === 'chat' || mode === 'quiz') {
      // Ensure we have all required parameters
      if (!bookId) {
        throw new Error("Missing required parameter: bookId");
      }
      
      if (mode === 'chat' && !userQuestion) {
        throw new Error("Missing required parameter for chat mode: userQuestion");
      }

      // Find relevant chunks for the query
      let relevantChunks: any[] = [];
      let contextUsed = false;
      
      if (mode === 'chat') {
        relevantChunks = await findRelevantChunks(userQuestion, bookId, pageNumber, searchScope as 'page' | 'book');
      } else if (mode === 'quiz') {
        // For quiz mode, get chunks from the current page or nearby
        if (pageNumber) {
          relevantChunks = await findRelevantChunks("quiz generation", bookId, pageNumber, searchScope as 'page' | 'book');
        }
      }
      
      let responseText = '';
      
      // If we found relevant chunks, use them for context
      if (relevantChunks && relevantChunks.length > 0) {
        contextUsed = true;
        const context = relevantChunks.map(chunk => chunk.content).join('\n\n');
        
        if (mode === 'chat') {
          try {
            responseText = await callGeminiAPI(userQuestion, context);
          } catch (error) {
            console.error(`Failed to get AI response: ${error.message}`);
            responseText = "I'm sorry, I encountered an error while processing your question.";
            contextUsed = false;
          }
        } else if (mode === 'quiz') {
          try {
            responseText = await generateQuiz(bookContent, relevantChunks);
          } catch (error) {
            console.error(`Failed to generate quiz: ${error.message}`);
            responseText = "I'm sorry, I couldn't generate a quiz at this time.";
            contextUsed = false;
          }
        }
      } else {
        // No RAG context found, fall back to current page only
        console.log("No RAG context found, falling back to current page only");
        contextUsed = false;
        
        if (mode === 'chat') {
          try {
            responseText = await callGeminiAPI(userQuestion, bookContent ? bookContent : "");
          } catch (error) {
            console.error(`Failed to get AI response: ${error.message}`);
            responseText = "I'm sorry, I encountered an error while processing your question.";
          }
        } else if (mode === 'quiz') {
          try {
            responseText = await generateQuiz(bookContent, [{ content: bookContent }]);
          } catch (error) {
            console.error(`Failed to generate quiz: ${error.message}`);
            responseText = "I'm sorry, I couldn't generate a quiz at this time.";
          }
        }
      }
      
      console.log(`Context used: ${contextUsed ? 'Yes' : 'No - using only current page'}`);
      
      return new Response(
        JSON.stringify({
          response: responseText,
          context_used: contextUsed,
          mode: mode,
          ...(mode === 'quiz' ? { quiz: responseText } : {})
        }),
        { 
          status: 200, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }
    
    // If we get here, the request was for an endpoint we don't support
    return new Response(
      JSON.stringify({ error: "Invalid endpoint or mode" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
    
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
