
-- Create function to match chunks from specific page using vector similarity
CREATE OR REPLACE FUNCTION match_page_chunks(
    query_embedding vector(768),
    page_id_param uuid,
    match_threshold float,
    match_count int
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
        bc.page_id = page_id_param
        AND 1 - (bc.embedding <=> query_embedding) > match_threshold
    ORDER BY
        bc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
