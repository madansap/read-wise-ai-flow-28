
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookContent, userQuestion, conversationId, user, quizMode } = await req.json();

    if (!bookContent && !quizMode) {
      throw new Error("Book content is required");
    }

    if (!userQuestion && !quizMode) {
      throw new Error("Question is required");
    }

    // Configure OpenAI
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OpenAI API key is not configured");
    }

    // Create a client for working with Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate appropriate system prompt based on mode
    let systemPrompt;
    let userPrompt;
    
    if (quizMode) {
      systemPrompt = `You are an educational AI designed to create quiz questions about reading material.
      Create engaging multiple-choice questions that test understanding of the provided text.
      For each question, provide 4 answer options with exactly one correct answer.
      Format your response as valid JSON that can be parsed with JSON.parse().
      
      The response should be an array of objects with the following structure:
      [
        {
          "question": "The question text goes here?",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctIndex": 2  // Index of the correct option (0-3)
        },
        ...more questions
      ]
      
      Generate ${quizMode === 'short' ? '3' : '5'} questions that are challenging but fair.`;
      
      userPrompt = `Here is the text content from the book to generate quiz questions about:\n\n${bookContent}`;
    } else {
      systemPrompt = `You are a helpful AI reading assistant. Your task is to answer questions about the text provided.
      Base your answers only on the provided text and your general knowledge about books and reading.
      If the answer cannot be found in the text, politely say so. Be concise but thorough in your explanations.
      Format your answers using markdown for better readability.`;
      
      userPrompt = `Here is the text content from the book:\n\n${bookContent}\n\nQuestion: ${userQuestion}`;
    }

    console.log("Calling OpenAI API...");
    
    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: quizMode ? 0.7 : 0.3,
      }),
    }),

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API error:", errorData);
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    console.log("OpenAI API response received");
    const aiResponse = data.choices[0].message.content;

    // If conversationId is provided and not in quiz mode, save the interaction to the database
    if (conversationId && user && !quizMode) {
      // Save user message
      await supabase.from("ai_messages").insert({
        conversation_id: conversationId,
        role: "user",
        content: userQuestion
      });

      // Save AI response
      await supabase.from("ai_messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: aiResponse
      });
    }

    return new Response(
      JSON.stringify({ 
        response: aiResponse 
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
});
