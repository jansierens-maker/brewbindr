-- Tasters on tasting notes
-- 1. A display name per user, shown as the taster of their notes and in the team.
-- 2. Tasting notes: every member adds notes in their own name (user_id = the caller;
--    a note for a guest is entered by a member and stays theirs); members change and
--    delete their own notes, brewery admins and brewmasters all notes of the brewery.
--    Replaces "Allow brewery members manage tasting_notes", which let every member
--    change or delete any note of the brewery (#124).
-- Idempotent and compatible with the previous app version: it only adds a column and
-- saves notes in the caller's name.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_display_name_length') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_display_name_length
      CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 40);
  END IF;
END $$;

DROP POLICY IF EXISTS "Allow brewery members manage tasting_notes" ON tasting_notes;

DROP POLICY IF EXISTS "Members add own tasting_notes" ON tasting_notes;
CREATE POLICY "Members add own tasting_notes" ON tasting_notes FOR INSERT
  WITH CHECK (brewery_id = get_user_brewery_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Members change own tasting_notes" ON tasting_notes;
CREATE POLICY "Members change own tasting_notes" ON tasting_notes FOR UPDATE
  USING (brewery_id = get_user_brewery_id()
         AND (user_id = auth.uid() OR get_user_brewery_role() IN ('admin', 'brewmaster')))
  WITH CHECK (brewery_id = get_user_brewery_id()
         AND (user_id = auth.uid() OR get_user_brewery_role() IN ('admin', 'brewmaster')));

DROP POLICY IF EXISTS "Members delete own tasting_notes" ON tasting_notes;
CREATE POLICY "Members delete own tasting_notes" ON tasting_notes FOR DELETE
  USING (brewery_id = get_user_brewery_id()
         AND (user_id = auth.uid() OR get_user_brewery_role() IN ('admin', 'brewmaster')));
