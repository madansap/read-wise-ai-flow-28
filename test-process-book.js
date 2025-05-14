// Test script for Supabase Edge Function book processing
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const FUNCTION_NAME = 'ai-assistant';

// Sample test data - Replace with actual values from your code
const testData = {
  endpoint: 'extract-pdf-text',
  book_id: '123e4567-e89b-12d3-a456-426614174000', // replace with a real book ID
  user_id: '123e4567-e89b-12d3-a456-426614174000', // replace with a real user ID
  file_path: 'books/some-file-path.pdf' // replace with a real file path
};

async function testProcessBook() {
  try {
    // Get the Supabase URL and anon key from environment variables
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase credentials in .env file');
      console.error('Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set');
      return;
    }

    // Path to a sample PDF file
    const pdfPath = path.join(__dirname, 'sample.pdf');
    
    // Check if the sample PDF exists
    if (!fs.existsSync(pdfPath)) {
      console.error(`Sample PDF file not found at: ${pdfPath}`);
      console.error('Please place a sample.pdf file in the project root for testing');
      return;
    }

    console.log('Testing PDF processing with Google Gemini API');
    
    // Read the PDF file
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');
    
    // Build the endpoint URL
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/ai-assistant`;
    
    // Use a test book ID
    const testBookId = '00000000-0000-0000-0000-000000000001';
    
    // Prepare the request
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({
        endpoint: 'upload-pdf',
        pdfBytes: pdfBase64,
        bookId: testBookId
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge function returned error ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    
    console.log('PDF processing response:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log(`Successfully processed ${result.pages} pages and created ${result.chunks} chunks`);
    } else {
      console.error('PDF processing failed:', result.message || 'Unknown error');
    }
  } catch (error) {
    console.error('Error testing PDF processing:', error);
  }
}

testProcessBook(); 