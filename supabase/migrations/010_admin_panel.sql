-- ============================================================
-- 010_admin_panel.sql
-- Admin panel: is_admin kolom + security definer functies
-- ============================================================

-- 1. Profiles tabel aanmaken (als die nog niet bestaat)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  is_admin BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- is_admin kolom toevoegen als profiles al bestaat maar de kolom nog niet heeft
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;

CREATE POLICY "Profiles viewable by authenticated" ON profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;

-- ============================================================
-- 2. Security definer functies voor admin operaties
-- ============================================================

-- Alle kantoren ophalen (admin only)
CREATE OR REPLACE FUNCTION admin_get_all_kantoren()
RETURNS TABLE(id uuid, naam text, slug text, created_at timestamptz, member_count bigint)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NULL OR NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
    SELECT k.id, k.naam, k.slug, k.created_at,
      (SELECT count(*) FROM kantoor_members km WHERE km.kantoor_id = k.id) as member_count
    FROM kantoren k ORDER BY k.created_at DESC;
END;
$$;

-- Nieuw kantoor aanmaken (admin only)
CREATE OR REPLACE FUNCTION admin_create_kantoor(p_naam text, p_slug text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_kantoor_id uuid;
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NULL OR NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  INSERT INTO kantoren (naam, slug) VALUES (p_naam, p_slug) RETURNING id INTO v_kantoor_id;
  RETURN v_kantoor_id;
END;
$$;

-- Leden van een kantoor ophalen (admin only)
CREATE OR REPLACE FUNCTION admin_get_kantoor_members(p_kantoor_id uuid)
RETURNS TABLE(id uuid, user_id uuid, role text, created_at timestamptz, email text, full_name text)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NULL OR NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
    SELECT km.id, km.user_id, km.role, km.created_at, p.email, p.full_name
    FROM kantoor_members km JOIN profiles p ON p.id = km.user_id
    WHERE km.kantoor_id = p_kantoor_id ORDER BY km.created_at;
END;
$$;

-- Lid toevoegen aan kantoor (admin only)
CREATE OR REPLACE FUNCTION admin_add_member(p_kantoor_id uuid, p_email text, p_role text DEFAULT 'member')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_normalized_email text;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NULL OR NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  v_normalized_email := lower(trim(p_email));
  SELECT id INTO v_user_id FROM profiles WHERE lower(trim(email)) = v_normalized_email;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Gebruiker niet gevonden'; END IF;
  INSERT INTO kantoor_members (kantoor_id, user_id, role) VALUES (p_kantoor_id, v_user_id, p_role);
END;
$$;

-- Rol van lid wijzigen (admin only)
CREATE OR REPLACE FUNCTION admin_update_member_role(p_member_id uuid, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NULL OR NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE kantoor_members SET role = p_role WHERE id = p_member_id;
END;
$$;

-- Lid verwijderen (admin only)
CREATE OR REPLACE FUNCTION admin_remove_member(p_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NULL OR NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM kantoor_members WHERE id = p_member_id;
END;
$$;
