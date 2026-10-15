-- KaiWriter cross-device sync: trash, pins, folders, tombstones, incremental pull, realtime

-- Documents: sync the metadata that previously stayed on one device.
ALTER TABLE public.kaiwriter_documents
  ADD COLUMN IF NOT EXISTS deleted_at bigint,
  ADD COLUMN IF NOT EXISTS purged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS folder_id text;

-- updated_at is the incremental-pull cursor, so it must come from the server
-- clock, not the client's.
CREATE OR REPLACE FUNCTION public.kaiwriter_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kaiwriter_documents_touch ON public.kaiwriter_documents;
CREATE TRIGGER kaiwriter_documents_touch
  BEFORE INSERT OR UPDATE ON public.kaiwriter_documents
  FOR EACH ROW EXECUTE FUNCTION public.kaiwriter_touch_updated_at();

CREATE INDEX IF NOT EXISTS kaiwriter_documents_user_updated_idx
  ON public.kaiwriter_documents (user_id, updated_at);

-- Folders
CREATE TABLE IF NOT EXISTS public.kaiwriter_folders (
  id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled Folder',
  sort_order integer,
  created_at bigint NOT NULL,
  modified_at bigint NOT NULL,
  deleted_at bigint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

DROP TRIGGER IF EXISTS kaiwriter_folders_touch ON public.kaiwriter_folders;
CREATE TRIGGER kaiwriter_folders_touch
  BEFORE INSERT OR UPDATE ON public.kaiwriter_folders
  FOR EACH ROW EXECUTE FUNCTION public.kaiwriter_touch_updated_at();

ALTER TABLE public.kaiwriter_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY kaiwriter_folders_select_own
  ON public.kaiwriter_folders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY kaiwriter_folders_insert_own
  ON public.kaiwriter_folders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY kaiwriter_folders_update_own
  ON public.kaiwriter_folders FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY kaiwriter_folders_delete_own
  ON public.kaiwriter_folders FOR DELETE
  USING (auth.uid() = user_id);

-- Realtime: push change notifications to the user's other open devices.
-- RLS still applies, so each client only receives its own rows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'kaiwriter_documents'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.kaiwriter_documents;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'kaiwriter_folders'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.kaiwriter_folders;
    END IF;
  END IF;
END;
$$;
