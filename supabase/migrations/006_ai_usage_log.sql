-- Migration: 006_ai_usage_log
-- Tracks AI API usage per user/dossier for cost monitoring (Sprint 9 rate limiting dashboard)

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  dossier_id uuid,
  sectie_key text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL,
  completion_tokens integer NOT NULL,
  total_tokens integer NOT NULL,
  estimated_cost_usd numeric(10,6) NOT NULL,
  is_cached boolean DEFAULT false,
  is_batch boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own rows
CREATE POLICY "Users read own ai_usage_log" ON ai_usage_log
  FOR SELECT USING (auth.uid() = user_id);

-- Service role (edge functions) can insert
CREATE POLICY "Service role insert ai_usage_log" ON ai_usage_log
  FOR INSERT WITH CHECK (true);

CREATE INDEX idx_ai_usage_log_user_created ON ai_usage_log(user_id, created_at);
CREATE INDEX idx_ai_usage_log_dossier_created ON ai_usage_log(dossier_id, created_at);
