-- Document chunks tabel — slaat individuele narrative chunks op per document
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  chapter TEXT,
  subchapter TEXT,
  chunk_type TEXT,
  raw_text TEXT,
  clean_text TEXT,
  writing_function TEXT,
  tones JSONB DEFAULT '[]',
  specificity TEXT,
  reuse_score NUMERIC,
  reuse_as_style_example BOOLEAN DEFAULT false,
  template_candidate BOOLEAN DEFAULT false,
  template_text TEXT,
  variables_detected JSONB DEFAULT '[]',
  object_address TEXT,
  object_type TEXT,
  market_segment TEXT,
  city TEXT,
  region TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Document writing profiles tabel — slaat één schrijfprofiel op per document
CREATE TABLE IF NOT EXISTS document_writing_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id TEXT UNIQUE NOT NULL,
  document_type TEXT,
  object_type TEXT,
  market_segment TEXT,
  tone_of_voice TEXT,
  detail_level TEXT,
  standardization_level TEXT,
  dominant_chapter_structure JSONB DEFAULT '[]',
  reuse_quality NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_writing_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own data
CREATE POLICY "Users can CRUD own document_chunks" ON document_chunks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own document_writing_profiles" ON document_writing_profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Grants: allow anon and authenticated roles to access the tables
GRANT ALL ON TABLE public.document_chunks TO anon, authenticated;
GRANT ALL ON TABLE public.document_writing_profiles TO anon, authenticated;
