-- Indexes voor efficiënte kennisbank-retrieval
-- De kolommen zelf zijn al aangemaakt in 002_document_chunks.sql

-- document_chunks indexes
CREATE INDEX IF NOT EXISTS idx_document_chunks_object_type
  ON document_chunks (object_type);

CREATE INDEX IF NOT EXISTS idx_document_chunks_city
  ON document_chunks (city);

CREATE INDEX IF NOT EXISTS idx_document_chunks_market_segment
  ON document_chunks (market_segment);

CREATE INDEX IF NOT EXISTS idx_document_chunks_reuse_score
  ON document_chunks (reuse_score DESC);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
  ON document_chunks (document_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_template_candidate
  ON document_chunks (template_candidate) WHERE template_candidate = true;

-- document_writing_profiles indexes
CREATE INDEX IF NOT EXISTS idx_document_writing_profiles_object_type
  ON document_writing_profiles (object_type);

CREATE INDEX IF NOT EXISTS idx_document_writing_profiles_market_segment
  ON document_writing_profiles (market_segment);

CREATE INDEX IF NOT EXISTS idx_document_writing_profiles_reuse_quality
  ON document_writing_profiles (reuse_quality DESC);
