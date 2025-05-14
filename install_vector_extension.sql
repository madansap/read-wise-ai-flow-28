-- Run this in the Supabase SQL Editor to install the vector extension
-- This is required for RAG functionality using embeddings

-- Install vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify the extension is installed
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

-- If you see output with the name and version, the extension is successfully installed 