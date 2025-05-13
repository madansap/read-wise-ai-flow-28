-- Create book_pages table to store extracted text from PDF pages
CREATE TABLE IF NOT EXISTS public.book_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(book_id, page_number)
);

-- Create book_chunks table to store smaller text chunks for better retrieval
CREATE TABLE IF NOT EXISTS public.book_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.book_pages(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536), -- OpenAI embeddings are 1536 dimensions
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(page_id, chunk_index)
);

-- Create indexes for faster vector search
CREATE INDEX IF NOT EXISTS book_chunks_book_id_idx ON public.book_chunks(book_id);
CREATE INDEX IF NOT EXISTS book_chunks_embedding_idx ON public.book_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create function to split text into chunks
CREATE OR REPLACE FUNCTION public.split_text_to_chunks(
  p_text TEXT,
  p_chunk_size INTEGER DEFAULT 1000,
  p_chunk_overlap INTEGER DEFAULT 200
) RETURNS TABLE (
  chunk_index INTEGER,
  chunk_content TEXT
) AS $$
DECLARE
  v_text_length INTEGER := length(p_text);
  v_start INTEGER := 1;
  v_end INTEGER;
  v_index INTEGER := 0;
BEGIN
  WHILE v_start <= v_text_length LOOP
    v_end := least(v_start + p_chunk_size - 1, v_text_length);
    
    RETURN QUERY SELECT
      v_index,
      substring(p_text from v_start for (v_end - v_start + 1));
      
    v_index := v_index + 1;
    v_start := v_start + p_chunk_size - p_chunk_overlap;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Add book_processed column to books table
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS is_processed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS processing_status TEXT;

-- Create RLS policies
ALTER TABLE public.book_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own book pages"
  ON public.book_pages
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own book chunks"
  ON public.book_chunks
  FOR SELECT
  USING (book_id IN (SELECT id FROM public.books WHERE user_id = auth.uid())); 