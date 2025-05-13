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
    const requestBody = await req.json();
    const { 
      bookContent, 
      userQuestion, 
      conversationId, 
      user, 
      mode = "chat", // Default mode is chat
      numQuestions = 3, // Default number of quiz questions
      quizEvaluation = null // Quiz evaluation data 
    } = requestBody;

    // Validate required parameters
    if (!bookContent && mode !== "quizEvaluation") {
      throw new Error("Book content is required");
    }

    if (mode === "chat" && !userQuestion) {
      throw new Error("Question is required in chat mode");
    }

    if (mode === "quizEvaluation" && !quizEvaluation) {
      throw new Error("Quiz evaluation data is required in quizEvaluation mode");
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

    // Generate appropriate system prompt and user prompt based on mode
    let systemPrompt;
    let userPrompt;
    let temperature = 0.3; // Default temperature
    let model = "gpt-4o-mini"; // Default model
    
    switch (mode) {
      case "chat":
        systemPrompt = chatSystemPrompt;
        userPrompt = chatUserPromptTemplate(bookContent, userQuestion);
        temperature = 0.3; // Analytical, precise responses
        break;
      
      case "quiz":
        systemPrompt = quizSystemPrompt;
        userPrompt = quizUserPromptTemplate(bookContent, numQuestions);
        temperature = 0.7; // More creative for question generation
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
        temperature = 0.4; // Balanced between creativity and accuracy
        break;
      
      case "explainSelection":
        systemPrompt = explainSelectionSystemPrompt;
        userPrompt = explainSelectionUserPromptTemplate(bookContent);
        temperature = 0.2; // Precise explanations
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
        model, // Use the selected model
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API error:", errorData);
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    console.log("OpenAI API response received");
    const aiResponse = data.choices[0].message.content;

    // If conversationId is provided and in chat mode, save the interaction to the database
    if (conversationId && user && mode === "chat") {
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
        response: aiResponse,
        mode // Include the mode in the response for client-side handling
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
