-- Comprehensive script to fix ReadWise database issues
-- Run this in Supabase SQL Editor to resolve table and extension issues

-- Step 1: Ensure the vector extension is installed
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Verify the extension is installed
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        RAISE EXCEPTION 'Vector extension is not installed properly. Please contact support.';
    END IF;
END $$;

-- Step 3: Add necessary processing columns to books table
ALTER TABLE IF EXISTS "public"."books" 
ADD COLUMN IF NOT EXISTS "is_processed" BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "processing_status" TEXT;

-- Step 4: Set default values for any null processing fields
UPDATE "public"."books" 
SET "is_processed" = FALSE,
    "processing_status" = 'Not processed'
WHERE "is_processed" IS NULL;

-- Step 5: Create book_pages table if it doesn't exist
CREATE TABLE IF NOT EXISTS "public"."book_pages" (
    "id" UUID PRIMARY KEY,
    "book_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY ("book_id") REFERENCES "public"."books" ("id") ON DELETE CASCADE
);

-- Step 6: Create book_chunks table for vector embeddings
CREATE TABLE IF NOT EXISTS "public"."book_chunks" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "book_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY ("book_id") REFERENCES "public"."books" ("id") ON DELETE CASCADE,
    FOREIGN KEY ("page_id") REFERENCES "public"."book_pages" ("id") ON DELETE CASCADE
);

-- Step 7: Create indexes for improved query performance
CREATE INDEX IF NOT EXISTS "idx_books_is_processed" ON "public"."books" ("is_processed");
CREATE INDEX IF NOT EXISTS "idx_book_pages_book_id" ON "public"."book_pages" ("book_id");
CREATE INDEX IF NOT EXISTS "idx_book_pages_page_number" ON "public"."book_pages" ("page_number");
CREATE INDEX IF NOT EXISTS "idx_book_chunks_book_id" ON "public"."book_chunks" ("book_id");
CREATE INDEX IF NOT EXISTS "idx_book_chunks_page_id" ON "public"."book_chunks" ("page_id");

-- Step 8: Create the vector similarity search function
CREATE OR REPLACE FUNCTION match_book_chunks(
    query_embedding vector(768),
    match_threshold float,
    match_count int,
    p_book_id uuid
)
RETURNS TABLE (
    id UUID,
    book_id UUID,
    page_id UUID,
    chunk_index INTEGER,
    content TEXT,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        bc.id,
        bc.book_id,
        bc.page_id,
        bc.chunk_index,
        bc.content,
        1 - (bc.embedding <=> query_embedding) as similarity
    FROM
        book_chunks bc
    WHERE
        bc.book_id = p_book_id
        AND 1 - (bc.embedding <=> query_embedding) > match_threshold
    ORDER BY
        similarity DESC
    LIMIT match_count;
END;
$$;

-- Step 9: Verify all tables have been created successfully
DO $$
DECLARE
    tables_exist BOOLEAN;
BEGIN
    SELECT 
        EXISTS(SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'books') AND
        EXISTS(SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'book_pages') AND
        EXISTS(SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'book_chunks')
    INTO tables_exist;
    
    IF NOT tables_exist THEN
        RAISE EXCEPTION 'One or more required tables do not exist. Please check for errors above.';
    END IF;
    
    -- Verify book columns
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'books' 
          AND column_name = 'is_processed'
    ) THEN
        RAISE EXCEPTION 'is_processed column not found in books table. Please check ALTER TABLE commands for errors.';
    END IF;
    
    -- Verify vector function
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_proc 
        WHERE proname = 'match_book_chunks'
    ) THEN
        RAISE EXCEPTION 'match_book_chunks function not created successfully. Please check for errors.';
    END IF;
    
    RAISE NOTICE 'All database tables and functions verified successfully.';
END $$; 