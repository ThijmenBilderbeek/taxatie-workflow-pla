-- Dossiers tabel
CREATE TABLE dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  dossiernummer TEXT,
  huidige_stap INTEGER DEFAULT 1,
  status TEXT DEFAULT 'concept',
  versie_nummer INTEGER DEFAULT 1,
  is_actualisatie BOOLEAN DEFAULT false,
  vorige_versie_id UUID,
  stap1 JSONB,
  stap2 JSONB,
  stap3 JSONB,
  stap4 JSONB,
  stap5 JSONB,
  stap6 JSONB,
  stap7 JSONB,
  stap8 JSONB,
  stap9 JSONB,
  stap10 JSONB,
  similarity_results JSONB DEFAULT '[]',
  geselecteerde_referenties JSONB DEFAULT '[]',
  rapport_secties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Historische rapporten tabel
CREATE TABLE historische_rapporten (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  rapport_id TEXT UNIQUE NOT NULL,
  adres JSONB NOT NULL,
  type_object TEXT,
  gebruiksdoel TEXT,
  bvo NUMERIC,
  vvo NUMERIC,
  perceeloppervlak NUMERIC,
  marktwaarde NUMERIC,
  bar NUMERIC,
  nar NUMERIC,
  waardepeildatum DATE,
  coordinaten JSONB,
  rapport_teksten JSONB DEFAULT '{}',
  wizard_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Similarity instellingen tabel
CREATE TABLE similarity_instellingen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  gewichten JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE historische_rapporten ENABLE ROW LEVEL SECURITY;
ALTER TABLE similarity_instellingen ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own data
CREATE POLICY "Users can CRUD own dossiers" ON dossiers
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own historische_rapporten" ON historische_rapporten
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own similarity_instellingen" ON similarity_instellingen
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
