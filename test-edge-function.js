// Test script for Supabase Edge Function
const fetch = require('node-fetch');
require('dotenv').config();

async function testEdgeFunction() {
  try {
    // Get the Supabase URL and anon key from environment variables
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase credentials in .env file');
      console.error('Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set');
      return;
    }

    console.log('Testing AI assistant edge function with Google Gemini API');
    
    // Build the endpoint URL
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/ai-assistant`;
    
    // Prepare the request
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({
        userQuestion: 'What is the capital of France?',
        mode: 'chat',
        bookContent: 'This is a test book content.',
        pageNumber: 1
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge function returned error ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    
    console.log('Edge function response:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.response) {
      console.log('\nAI Assistant response:');
      console.log(result.response);
    }
  } catch (error) {
    console.error('Error testing edge function:', error);
  }
}

testEdgeFunction(); 