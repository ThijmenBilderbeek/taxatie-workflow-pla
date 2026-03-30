CREATE TABLE IF NOT EXISTS suggestie_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id TEXT NOT NULL,
  stap INTEGER NOT NULL,
  veld_naam TEXT NOT NULL,
  gesuggereerde_tekst TEXT NOT NULL,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('positief', 'negatief')),
  reden TEXT,
  toelichting TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE suggestie_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own feedback"
  ON suggestie_feedback FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view all feedback"
  ON suggestie_feedback FOR SELECT
  USING (true);

GRANT INSERT, SELECT ON suggestie_feedback TO anon, authenticated;
