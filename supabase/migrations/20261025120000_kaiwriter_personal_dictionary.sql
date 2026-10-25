-- KaiWriter personal dictionary, synced across a user's devices.
--
-- One row per word (not one list per user) so two devices can add and remove
-- different words at the same time without overwriting each other. Removals
-- are kept as tombstones (deleted_at) so other devices remove the word too.
-- Conflicts on the same word: the later modified_at wins.
--
-- Requires 20261015120000_kaiwriter_cross_device_sync.sql (kaiwriter_touch_updated_at).

CREATE TABLE IF NOT EXISTS public.kaiwriter_dictionary_words (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Normalised form used for matching (lower case, straight apostrophes, no surrounding punctuation).
  word_norm text NOT NULL CHECK (char_length(word_norm) BETWEEN 1 AND 64),
  -- The word as the user added it.
  word text NOT NULL CHECK (char_length(word) BETWEEN 1 AND 64),
  modified_at bigint NOT NULL,
  deleted_at bigint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, word_norm)
);

CREATE INDEX IF NOT EXISTS kaiwriter_dictionary_words_user_updated_idx
  ON public.kaiwriter_dictionary_words (user_id, updated_at);

DROP TRIGGER IF EXISTS kaiwriter_dictionary_words_touch ON public.kaiwriter_dictionary_words;
CREATE TRIGGER kaiwriter_dictionary_words_touch
  BEFORE INSERT OR UPDATE ON public.kaiwriter_dictionary_words
  FOR EACH ROW EXECUTE FUNCTION public.kaiwriter_touch_updated_at();

ALTER TABLE public.kaiwriter_dictionary_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY kaiwriter_dictionary_select_own
  ON public.kaiwriter_dictionary_words FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY kaiwriter_dictionary_insert_own
  ON public.kaiwriter_dictionary_words FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY kaiwriter_dictionary_update_own
  ON public.kaiwriter_dictionary_words FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY kaiwriter_dictionary_delete_own
  ON public.kaiwriter_dictionary_words FOR DELETE
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'kaiwriter_dictionary_words'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kaiwriter_dictionary_words;
  END IF;
END;
$$;
