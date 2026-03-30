-- Migration: 005_sectie_feedback
-- Tracks feedback on AI-generated rapport sections:
-- 'positief' = taxateur accepted the section unchanged
-- 'negatief' = taxateur rejected via thumbs-down
-- 'bewerkt'  = taxateur edited the AI-generated text

CREATE TABLE IF NOT EXISTS sectie_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  dossier_id text NOT NULL,
  sectie_key text NOT NULL,
  feedback_type text NOT NULL CHECK (feedback_type IN ('positief', 'negatief', 'bewerkt')),
  originele_tekst text NOT NULL,
  bewerkte_tekst text,
  reden text,
  toelichting text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sectie_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sectie feedback" ON sectie_feedback
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_sectie_feedback_sectie_key ON sectie_feedback(sectie_key);
CREATE INDEX idx_sectie_feedback_type ON sectie_feedback(feedback_type);
