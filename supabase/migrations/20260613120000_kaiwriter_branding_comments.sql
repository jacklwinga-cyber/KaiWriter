-- KaiWriter Month 4: branding + comments

ALTER TABLE public.kaiwriter_documents
  ADD COLUMN IF NOT EXISTS branding jsonb;

CREATE TABLE IF NOT EXISTS public.kaiwriter_comments (
  id text NOT NULL,
  document_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT 'User',
  body text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document_id, id)
);

CREATE INDEX IF NOT EXISTS kaiwriter_comments_doc_idx
  ON public.kaiwriter_comments (user_id, document_id, created_at DESC);

ALTER TABLE public.kaiwriter_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY kaiwriter_comments_select_own
  ON public.kaiwriter_comments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY kaiwriter_comments_insert_own
  ON public.kaiwriter_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY kaiwriter_comments_update_own
  ON public.kaiwriter_comments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY kaiwriter_comments_delete_own
  ON public.kaiwriter_comments FOR DELETE
  USING (auth.uid() = user_id);
