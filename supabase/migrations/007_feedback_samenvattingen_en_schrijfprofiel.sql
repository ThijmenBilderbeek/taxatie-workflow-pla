-- Migration: 007_feedback_samenvattingen_en_schrijfprofiel
-- Creates tables for the 3-layer feedback system:
--   Layer 1: feedback_samenvattingen — AI-generated summaries of all historical feedback
--   Layer 3: gebruiker_schrijfprofiel — AI-generated writing profile per user

-- ---------------------------------------------------------------------------
-- Table: feedback_samenvattingen
-- Stores a condensed AI summary of all historical feedback for a given
-- context (field or section) per user.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_samenvattingen (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_key  TEXT        NOT NULL,
  context_type TEXT        NOT NULL CHECK (context_type IN ('veld', 'sectie')),
  samenvatting TEXT        NOT NULL,
  feedback_count INTEGER   NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, context_key, context_type)
);

ALTER TABLE feedback_samenvattingen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own feedback summaries"
  ON feedback_samenvattingen FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback summaries"
  ON feedback_samenvattingen FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback summaries"
  ON feedback_samenvattingen FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_feedback_samenvattingen_user_context
  ON feedback_samenvattingen (user_id, context_key, context_type);

GRANT SELECT, INSERT, UPDATE ON feedback_samenvattingen TO authenticated;

-- ---------------------------------------------------------------------------
-- Table: gebruiker_schrijfprofiel
-- Stores an AI-generated description of a user's writing preferences,
-- derived from patterns in how they edit AI-generated section text.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gebruiker_schrijfprofiel (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  profiel               TEXT        NOT NULL,
  bewerkingen_verwerkt  INTEGER     NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gebruiker_schrijfprofiel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own schrijfprofiel"
  ON gebruiker_schrijfprofiel FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own schrijfprofiel"
  ON gebruiker_schrijfprofiel FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own schrijfprofiel"
  ON gebruiker_schrijfprofiel FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_gebruiker_schrijfprofiel_user_id
  ON gebruiker_schrijfprofiel (user_id);

GRANT SELECT, INSERT, UPDATE ON gebruiker_schrijfprofiel TO authenticated;
