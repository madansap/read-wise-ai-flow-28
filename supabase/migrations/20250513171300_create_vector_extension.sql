-- Enable the pgvector extension for Supabase
-- This must run before any tables using the vector type are created
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify the extension is enabled by checking the version
DO $$
BEGIN
    RAISE NOTICE 'Vector extension enabled: %', EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
    );
END $$; 