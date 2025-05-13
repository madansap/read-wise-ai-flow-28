-- Create vector similarity search function
CREATE OR REPLACE FUNCTION match_book_chunks(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT,
  p_book_id UUID
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  book_id UUID,
  page_id UUID,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_variable
BEGIN
  RETURN QUERY
  SELECT
    book_chunks.id,
    book_chunks.content,
    book_chunks.book_id,
    book_chunks.page_id,
    1 - (book_chunks.embedding <=> query_embedding) AS similarity
  FROM book_chunks
  WHERE 
    book_chunks.book_id = p_book_id AND
    1 - (book_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY book_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$; 