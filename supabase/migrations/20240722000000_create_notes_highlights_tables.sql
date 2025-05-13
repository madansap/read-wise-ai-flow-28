-- Create notes table
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    book_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    selected_text TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    color TEXT DEFAULT '#FFEB3B',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create highlights table
CREATE TABLE IF NOT EXISTS highlights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    book_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    text TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS notes_user_id_idx ON notes (user_id);
CREATE INDEX IF NOT EXISTS notes_book_id_idx ON notes (book_id);
CREATE INDEX IF NOT EXISTS notes_page_number_idx ON notes (page_number);

CREATE INDEX IF NOT EXISTS highlights_user_id_idx ON highlights (user_id);
CREATE INDEX IF NOT EXISTS highlights_book_id_idx ON highlights (book_id);
CREATE INDEX IF NOT EXISTS highlights_page_number_idx ON highlights (page_number);

-- Add row level security policies
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;

-- Policy for notes: users can only access their own notes
CREATE POLICY notes_select_policy ON notes
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY notes_insert_policy ON notes
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY notes_update_policy ON notes
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY notes_delete_policy ON notes
    FOR DELETE
    USING (auth.uid() = user_id);

-- Policy for highlights: users can only access their own highlights
CREATE POLICY highlights_select_policy ON highlights
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY highlights_insert_policy ON highlights
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY highlights_delete_policy ON highlights
    FOR DELETE
    USING (auth.uid() = user_id);

-- Allow authorized users to query notes and highlights
GRANT SELECT, INSERT, UPDATE, DELETE ON notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON highlights TO authenticated;

-- Function to create a note
CREATE OR REPLACE FUNCTION create_note(
    p_user_id UUID,
    p_book_id TEXT,
    p_page_number INTEGER,
    p_selected_text TEXT,
    p_title TEXT,
    p_content TEXT DEFAULT NULL,
    p_color TEXT DEFAULT '#FFEB3B'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO notes (
        user_id,
        book_id,
        page_number,
        selected_text,
        title,
        content,
        color
    ) VALUES (
        p_user_id,
        p_book_id,
        p_page_number,
        p_selected_text,
        p_title,
        p_content,
        p_color
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a highlight
CREATE OR REPLACE FUNCTION create_highlight(
    p_user_id UUID,
    p_book_id TEXT,
    p_page_number INTEGER,
    p_text TEXT,
    p_color TEXT
) RETURNS VOID AS $$
BEGIN
    INSERT INTO highlights (
        user_id,
        book_id,
        page_number,
        text,
        color
    ) VALUES (
        p_user_id,
        p_book_id,
        p_page_number,
        p_text,
        p_color
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get page highlights
CREATE OR REPLACE FUNCTION get_page_highlights(
    p_user_id UUID,
    p_book_id TEXT,
    p_page_number INTEGER
) RETURNS SETOF highlights AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM highlights
    WHERE user_id = p_user_id
    AND book_id = p_book_id
    AND page_number = p_page_number
    ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 