-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Similarity instellingen (globaal)
CREATE TABLE similarity_instellingen (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gewicht_afstand INT NOT NULL DEFAULT 30,
  gewicht_type_object INT NOT NULL DEFAULT 25,
  gewicht_oppervlakte INT NOT NULL DEFAULT 20,
  gewicht_ouderheid INT NOT NULL DEFAULT 15,
  gewicht_gebruiksdoel INT NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Historische rapporten (kennisbank)
CREATE TABLE historische_rapporten (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  adres TEXT NOT NULL,
  postcode TEXT,
  stad TEXT,
  lat FLOAT,
  lng FLOAT,
  object_type TEXT,
  oppervlakte INT,
  bouwjaar INT,
  taxatiedatum DATE,
  marktwaarde DECIMAL(15,2),
  rapport_tekst TEXT,
  taxateur TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Dossiers
CREATE TABLE dossiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dossiernummer TEXT NOT NULL UNIQUE,
  versie_nummer INT DEFAULT 1,
  is_actualisatie BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'concept',
  wizard_data JSONB DEFAULT '{}',
  rapport_secties JSONB DEFAULT '{}',
  geselecteerde_referenties JSONB DEFAULT '[]',
  similarity_results JSONB DEFAULT '[]',
  huidige_stap INT DEFAULT 1,
  taxateur_id UUID REFERENCES auth.users(id),
  taxateur_naam TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Feedback
CREATE TABLE similarity_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dossier_id UUID REFERENCES dossiers(id) ON DELETE CASCADE,
  historisch_rapport_id UUID REFERENCES historische_rapporten(id),
  sectie TEXT,
  score INT,
  reden TEXT,
  opmerking TEXT,
  taxateur_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Taxateur profielen
CREATE TABLE taxateur_profielen (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  naam TEXT,
  email TEXT,
  rol TEXT DEFAULT 'taxateur',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dossiers_updated_at
  BEFORE UPDATE ON dossiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS Policies
ALTER TABLE dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE historische_rapporten ENABLE ROW LEVEL SECURITY;
ALTER TABLE similarity_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE similarity_instellingen ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxateur_profielen ENABLE ROW LEVEL SECURITY;

-- Alle ingelogde taxateurs kunnen alles zien en bewerken
CREATE POLICY "Ingelogde gebruikers kunnen dossiers zien" ON dossiers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Ingelogde gebruikers kunnen rapporten zien" ON historische_rapporten FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Ingelogde gebruikers kunnen feedback zien" ON similarity_feedback FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Ingelogde gebruikers kunnen instellingen zien" ON similarity_instellingen FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Gebruikers kunnen eigen profiel zien" ON taxateur_profielen FOR ALL USING (auth.uid() = id);

-- Seed: standaard similarity instellingen
INSERT INTO similarity_instellingen (gewicht_afstand, gewicht_type_object, gewicht_oppervlakte, gewicht_ouderheid, gewicht_gebruiksdoel)
VALUES (30, 25, 20, 15, 10);
