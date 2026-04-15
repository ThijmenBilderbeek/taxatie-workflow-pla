-- Add filter_semantic_type parameter to match_document_chunks RPC
-- This enables semantic-type-based filtering in kennisbankRetriever.ts
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_object_type text DEFAULT NULL,
  filter_market_segment text DEFAULT NULL,
  filter_kantoor_id uuid DEFAULT NULL,
  filter_semantic_type text DEFAULT NULL
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
    AND (filter_kantoor_id IS NULL OR dc.kantoor_id = filter_kantoor_id)
    AND (filter_semantic_type IS NULL OR dc.metadata->>'semantic_type' = filter_semantic_type)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
