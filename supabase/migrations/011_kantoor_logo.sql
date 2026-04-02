-- ============================================================
-- 011_kantoor_logo.sql
-- Kantoor logo: logo_url kolom + storage bucket + admin functies
-- ============================================================

-- 1. Voeg logo_url kolom toe aan kantoren tabel
ALTER TABLE kantoren ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- ============================================================
-- 2. Storage bucket voor kantoor logo's
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('kantoor-logos', 'kantoor-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies voor storage bucket
DROP POLICY IF EXISTS "Public read kantoor logos" ON storage.objects;
CREATE POLICY "Public read kantoor logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'kantoor-logos');

DROP POLICY IF EXISTS "Authenticated upload kantoor logos" ON storage.objects;
CREATE POLICY "Authenticated upload kantoor logos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'kantoor-logos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated update kantoor logos" ON storage.objects;
CREATE POLICY "Authenticated update kantoor logos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'kantoor-logos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated delete kantoor logos" ON storage.objects;
CREATE POLICY "Authenticated delete kantoor logos" ON storage.objects
  FOR DELETE USING (bucket_id = 'kantoor-logos' AND auth.role() = 'authenticated');

-- ============================================================
-- 3. Update admin_get_all_kantoren om logo_url terug te geven
-- ============================================================

CREATE OR REPLACE FUNCTION admin_get_all_kantoren()
RETURNS TABLE(id uuid, naam text, slug text, logo_url text, created_at timestamptz, member_count bigint)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NULL OR NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
    SELECT k.id, k.naam, k.slug, k.logo_url, k.created_at,
      (SELECT count(*) FROM kantoor_members km WHERE km.kantoor_id = k.id) as member_count
    FROM kantoren k ORDER BY k.created_at DESC;
END;
$$;

-- ============================================================
-- 4. Functie om logo_url bij te werken (admin only)
-- ============================================================

CREATE OR REPLACE FUNCTION admin_update_kantoor_logo(p_kantoor_id uuid, p_logo_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NULL OR NOT v_is_admin THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE kantoren SET logo_url = p_logo_url, updated_at = now() WHERE id = p_kantoor_id;
END;
$$;
