-- Migration: 009_kantoor_invites
-- Adds kantoor_invites table for inviting users to a kantoor via email.

CREATE TABLE IF NOT EXISTS kantoor_invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kantoor_id  UUID        REFERENCES kantoren(id) ON DELETE CASCADE NOT NULL,
  email       TEXT        NOT NULL,
  invited_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(kantoor_id, email)
);

-- ---------------------------------------------------------------------------
-- RLS for kantoor_invites
-- ---------------------------------------------------------------------------

ALTER TABLE kantoor_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kantoor admins can manage invites" ON kantoor_invites
  FOR ALL
  USING (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km
      WHERE km.user_id = auth.uid() AND km.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    kantoor_id IN (
      SELECT km.kantoor_id FROM kantoor_members km
      WHERE km.user_id = auth.uid() AND km.role IN ('owner', 'admin')
    )
  );

-- Allow invited users to read their own invite (for accepting)
CREATE POLICY "Invited users can view their own invite" ON kantoor_invites
  FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kantoor_invites TO authenticated;
