-- Add necessary columns to books table for processing status
ALTER TABLE IF EXISTS "public"."books" 
ADD COLUMN IF NOT EXISTS "is_processed" BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "processing_status" TEXT;

-- Update any existing rows to have default values
UPDATE "public"."books" 
SET "is_processed" = FALSE,
    "processing_status" = 'Not processed'
WHERE "is_processed" IS NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS "idx_books_is_processed" ON "public"."books" ("is_processed");
