-- Migration 007: Multi-kantoor architectuur
-- Maakt kantoor-level isolatie mogelijk zodat medewerkers binnen hetzelfde kantoor
-- elkaars data kunnen zien, terwijl kantoren volledig geïsoleerd zijn van elkaar.

-- ---------------------------------------------------------------------------
-- 1. Kantoren tabel
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kantoren (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  naam TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Kantoor members koppeltabel
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kantoor_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kantoor_id UUID REFERENCES kantoren(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(kantoor_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 3. RLS voor kantoren en kantoor_members
-- ---------------------------------------------------------------------------
ALTER TABLE kantoren ENABLE ROW LEVEL SECURITY;
ALTER TABLE kantoor_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kantoor members can view their kantoor" ON kantoren
  FOR SELECT USING (id IN (SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()));

CREATE POLICY "Kantoor members can view members of their kantoor" ON kantoor_members
  FOR SELECT USING (kantoor_id IN (SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()));

-- Owners/admins can manage members
CREATE POLICY "Kantoor admins can manage members" ON kantoor_members
  FOR ALL USING (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km
      WHERE km.user_id = auth.uid() AND km.role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km
      WHERE km.user_id = auth.uid() AND km.role IN ('owner', 'admin')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kantoren TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kantoor_members TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Voeg kantoor_id toe aan alle bestaande data-tabellen
-- ---------------------------------------------------------------------------
-- kantoor_id is nullable om bestaande data niet te breken; backfill bestaande
-- rijen naar het juiste kantoor nadat kantoren zijn aangemaakt.

ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS kantoor_id UUID REFERENCES kantoren(id);
ALTER TABLE historische_rapporten ADD COLUMN IF NOT EXISTS kantoor_id UUID REFERENCES kantoren(id);
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS kantoor_id UUID REFERENCES kantoren(id);
ALTER TABLE document_writing_profiles ADD COLUMN IF NOT EXISTS kantoor_id UUID REFERENCES kantoren(id);
ALTER TABLE sectie_feedback ADD COLUMN IF NOT EXISTS kantoor_id UUID REFERENCES kantoren(id);
ALTER TABLE ai_usage_log ADD COLUMN IF NOT EXISTS kantoor_id UUID REFERENCES kantoren(id);
ALTER TABLE similarity_instellingen ADD COLUMN IF NOT EXISTS kantoor_id UUID REFERENCES kantoren(id);

-- ---------------------------------------------------------------------------
-- 5. Indexen op kantoor_id voor performante queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS dossiers_kantoor_id_idx ON dossiers (kantoor_id);
CREATE INDEX IF NOT EXISTS historische_rapporten_kantoor_id_idx ON historische_rapporten (kantoor_id);
CREATE INDEX IF NOT EXISTS document_chunks_kantoor_id_idx ON document_chunks (kantoor_id);
CREATE INDEX IF NOT EXISTS document_writing_profiles_kantoor_id_idx ON document_writing_profiles (kantoor_id);
CREATE INDEX IF NOT EXISTS sectie_feedback_kantoor_id_idx ON sectie_feedback (kantoor_id);
CREATE INDEX IF NOT EXISTS ai_usage_log_kantoor_id_idx ON ai_usage_log (kantoor_id);
CREATE INDEX IF NOT EXISTS similarity_instellingen_kantoor_id_idx ON similarity_instellingen (kantoor_id);

-- ---------------------------------------------------------------------------
-- 6. Herschrijf RLS-policies naar kantoor-level
-- ---------------------------------------------------------------------------

-- dossiers
DROP POLICY IF EXISTS "Users can CRUD own dossiers" ON dossiers;
DROP POLICY IF EXISTS "Users can read own dossiers" ON dossiers;
DROP POLICY IF EXISTS "Users can insert own dossiers" ON dossiers;
DROP POLICY IF EXISTS "Users can update own dossiers" ON dossiers;
DROP POLICY IF EXISTS "Users can delete own dossiers" ON dossiers;

CREATE POLICY "Kantoor members can access dossiers" ON dossiers
  FOR ALL
  USING (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()
    )
  )
  WITH CHECK (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()
    )
  );

-- historische_rapporten
DROP POLICY IF EXISTS "Users can CRUD own historische_rapporten" ON historische_rapporten;
DROP POLICY IF EXISTS "Users can read own historische_rapporten" ON historische_rapporten;
DROP POLICY IF EXISTS "Users can insert own historische_rapporten" ON historische_rapporten;
DROP POLICY IF EXISTS "Users can update own historische_rapporten" ON historische_rapporten;
DROP POLICY IF EXISTS "Users can delete own historische_rapporten" ON historische_rapporten;

CREATE POLICY "Kantoor members can access historische_rapporten" ON historische_rapporten
  FOR ALL
  USING (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()
    )
  )
  WITH CHECK (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()
    )
  );

-- document_chunks
DROP POLICY IF EXISTS "Users can CRUD own document_chunks" ON document_chunks;
DROP POLICY IF EXISTS "Users can read own document_chunks" ON document_chunks;
DROP POLICY IF EXISTS "Users can insert own document_chunks" ON document_chunks;
DROP POLICY IF EXISTS "Users can update own document_chunks" ON document_chunks;
DROP POLICY IF EXISTS "Users can delete own document_chunks" ON document_chunks;

CREATE POLICY "Kantoor members can access document_chunks" ON document_chunks
  FOR ALL
  USING (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()
    )
  )
  WITH CHECK (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()
    )
  );

-- document_writing_profiles
DROP POLICY IF EXISTS "Users can CRUD own document_writing_profiles" ON document_writing_profiles;
DROP POLICY IF EXISTS "Users can read own document_writing_profiles" ON document_writing_profiles;
DROP POLICY IF EXISTS "Users can insert own document_writing_profiles" ON document_writing_profiles;
DROP POLICY IF EXISTS "Users can update own document_writing_profiles" ON document_writing_profiles;
DROP POLICY IF EXISTS "Users can delete own document_writing_profiles" ON document_writing_profiles;

CREATE POLICY "Kantoor members can access document_writing_profiles" ON document_writing_profiles
  FOR ALL
  USING (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()
    )
  )
  WITH CHECK (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()
    )
  );

-- sectie_feedback
DROP POLICY IF EXISTS "Users can CRUD own sectie_feedback" ON sectie_feedback;
DROP POLICY IF EXISTS "Users can read own sectie_feedback" ON sectie_feedback;
DROP POLICY IF EXISTS "Users can insert own sectie_feedback" ON sectie_feedback;
DROP POLICY IF EXISTS "Users can update own sectie_feedback" ON sectie_feedback;
DROP POLICY IF EXISTS "Users can delete own sectie_feedback" ON sectie_feedback;

CREATE POLICY "Kantoor members can access sectie_feedback" ON sectie_feedback
  FOR ALL
  USING (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()
    )
  )
  WITH CHECK (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()
    )
  );

-- ai_usage_log
DROP POLICY IF EXISTS "Users can read own ai_usage_log" ON ai_usage_log;
DROP POLICY IF EXISTS "Users can insert own ai_usage_log" ON ai_usage_log;

CREATE POLICY "Kantoor members can access ai_usage_log" ON ai_usage_log
  FOR ALL
  USING (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()
    )
  )
  WITH CHECK (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()
    )
  );

-- similarity_instellingen
DROP POLICY IF EXISTS "Users can CRUD own similarity_instellingen" ON similarity_instellingen;
DROP POLICY IF EXISTS "Users can read own similarity_instellingen" ON similarity_instellingen;
DROP POLICY IF EXISTS "Users can insert own similarity_instellingen" ON similarity_instellingen;
DROP POLICY IF EXISTS "Users can update own similarity_instellingen" ON similarity_instellingen;
DROP POLICY IF EXISTS "Users can delete own similarity_instellingen" ON similarity_instellingen;

CREATE POLICY "Kantoor members can access similarity_instellingen" ON similarity_instellingen
  FOR ALL
  USING (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()
    )
  )
  WITH CHECK (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km WHERE km.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Update match_document_chunks RPC met filter_kantoor_id parameter
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_object_type text DEFAULT NULL,
  filter_market_segment text DEFAULT NULL,
  filter_kantoor_id uuid DEFAULT NULL
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
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
