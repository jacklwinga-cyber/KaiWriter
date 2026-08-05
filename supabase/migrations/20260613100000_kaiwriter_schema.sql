-- KaiWriter cloud documents
CREATE TABLE IF NOT EXISTS public.kaiwriter_documents (
  id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled Document',
  content text NOT NULL DEFAULT '',
  template_id text,
  last_modified bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS kaiwriter_documents_user_modified_idx
  ON public.kaiwriter_documents (user_id, last_modified DESC);

ALTER TABLE public.kaiwriter_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY kaiwriter_docs_select_own
  ON public.kaiwriter_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY kaiwriter_docs_insert_own
  ON public.kaiwriter_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY kaiwriter_docs_update_own
  ON public.kaiwriter_documents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY kaiwriter_docs_delete_own
  ON public.kaiwriter_documents FOR DELETE
  USING (auth.uid() = user_id);

-- Stripe subscription state (written by webhook via service role)
CREATE TABLE IF NOT EXISTS public.kaiwriter_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'teams')),
  status text NOT NULL DEFAULT 'inactive',
  current_period_end timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kaiwriter_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY kaiwriter_sub_select_own
  ON public.kaiwriter_subscriptions FOR SELECT
  USING (auth.uid() = user_id);
