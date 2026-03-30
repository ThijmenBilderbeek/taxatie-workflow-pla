-- Sprint 7: Vector embeddings for semantic search
-- Enables pgvector extension, adds embedding column to document_chunks,
-- creates a performance index, and defines the match_document_chunks RPC.

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column (1536 dimensions for text-embedding-ada-002)
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. Create IVFFlat index for approximate nearest-neighbour search
--    (lists=100 is a reasonable default for moderate dataset sizes)
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4. RPC function: match_document_chunks
--    Returns chunks whose embeddings are within match_threshold cosine similarity
--    of query_embedding, optionally filtered by object_type and market_segment.
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_object_type text DEFAULT NULL,
  filter_market_segment text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id text,
  chapter text,
  subchapter text,
  chunk_type text,
  raw_text text,
  clean_text text,
  writing_function text,
  tones text[],
  specificity text,
  reuse_score float,
  reuse_as_style_example boolean,
  template_candidate boolean,
  template_text text,
  variables_detected text[],
  object_address text,
  object_type text,
  market_segment text,
  city text,
  region text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  embedding vector(1536),
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id, dc.document_id, dc.chapter, dc.subchapter, dc.chunk_type,
    dc.raw_text, dc.clean_text, dc.writing_function, dc.tones, dc.specificity,
    dc.reuse_score, dc.reuse_as_style_example, dc.template_candidate,
    dc.template_text, dc.variables_detected, dc.object_address,
    dc.object_type, dc.market_segment, dc.city, dc.region,
    dc.metadata, dc.created_at, dc.updated_at, dc.embedding,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
    AND (filter_object_type IS NULL OR dc.object_type = filter_object_type)
    AND (filter_market_segment IS NULL OR dc.market_segment = filter_market_segment)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
