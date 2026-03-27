-- Completeer het kennisbank schema: eventueel ontbrekende kolommen, indexen en RLS policies
-- Alle statements zijn idempotent via IF NOT EXISTS / DO $$...EXCEPTION blocks

-- document_chunks: voeg ontbrekende kolommen toe als ze er nog niet zijn
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='object_address') THEN
    ALTER TABLE document_chunks ADD COLUMN object_address TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='object_type') THEN
    ALTER TABLE document_chunks ADD COLUMN object_type TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='market_segment') THEN
    ALTER TABLE document_chunks ADD COLUMN market_segment TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='city') THEN
    ALTER TABLE document_chunks ADD COLUMN city TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='region') THEN
    ALTER TABLE document_chunks ADD COLUMN region TEXT;
  END IF;
END $$;

-- document_writing_profiles: voeg ontbrekende kolommen toe als ze er nog niet zijn
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_writing_profiles' AND column_name='market_segment') THEN
    ALTER TABLE document_writing_profiles ADD COLUMN market_segment TEXT;
  END IF;
END $$;

-- Indexen op document_chunks (idempotent via IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
  ON document_chunks (document_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_chunk_type
  ON document_chunks (chunk_type);

CREATE INDEX IF NOT EXISTS idx_document_chunks_reuse_score
  ON document_chunks (reuse_score DESC);

CREATE INDEX IF NOT EXISTS idx_document_chunks_city
  ON document_chunks (city);

CREATE INDEX IF NOT EXISTS idx_document_chunks_object_type
  ON document_chunks (object_type);

CREATE INDEX IF NOT EXISTS idx_document_chunks_market_segment
  ON document_chunks (market_segment);

CREATE INDEX IF NOT EXISTS idx_document_chunks_template_candidate
  ON document_chunks (template_candidate) WHERE template_candidate = true;

-- Indexen op document_writing_profiles (idempotent via IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_document_writing_profiles_object_type
  ON document_writing_profiles (object_type);

CREATE INDEX IF NOT EXISTS idx_document_writing_profiles_market_segment
  ON document_writing_profiles (market_segment);

CREATE INDEX IF NOT EXISTS idx_document_writing_profiles_reuse_quality
  ON document_writing_profiles (reuse_quality DESC);

-- RLS inschakelen (veilig als het al aan staat)
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_writing_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies (voeg toe als ze nog niet bestaan)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'document_chunks' AND policyname = 'Users can CRUD own document_chunks'
  ) THEN
    CREATE POLICY "Users can CRUD own document_chunks" ON document_chunks
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'document_writing_profiles' AND policyname = 'Users can CRUD own document_writing_profiles'
  ) THEN
    CREATE POLICY "Users can CRUD own document_writing_profiles" ON document_writing_profiles
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Grants (idempotent)
GRANT ALL ON TABLE public.document_chunks TO anon, authenticated;
GRANT ALL ON TABLE public.document_writing_profiles TO anon, authenticated;
