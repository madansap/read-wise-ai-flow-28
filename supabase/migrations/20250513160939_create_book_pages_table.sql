
-- Create the vector extension if it doesn't exist
CREATE EXTENSION IF NOT EXISTS vector;

-- Create book_pages table if it doesn't exist
CREATE TABLE IF NOT EXISTS "public"."book_pages" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "book_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY ("book_id") REFERENCES "public"."books" ("id") ON DELETE CASCADE
);

-- Create index on book_pages
CREATE INDEX IF NOT EXISTS "idx_book_pages_book_id" ON "public"."book_pages" ("book_id");
CREATE INDEX IF NOT EXISTS "idx_book_pages_page_number" ON "public"."book_pages" ("page_number");

-- Create book_chunks table if it doesn't exist
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

-- Create indexes on book_chunks
CREATE INDEX IF NOT EXISTS "idx_book_chunks_book_id" ON "public"."book_chunks" ("book_id");
CREATE INDEX IF NOT EXISTS "idx_book_chunks_page_id" ON "public"."book_chunks" ("page_id");

-- Create the function for matching book chunks based on vector similarity
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
