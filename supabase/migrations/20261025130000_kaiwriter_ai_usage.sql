-- KaiWriter AI usage: per-user daily request counts and token totals, used to
-- enforce daily limits in the writing-assist edge function.
--
-- Additive only: a new table and two functions. Users can read their own
-- rows; only the edge function (service role) can change them, through the
-- two functions below, which count atomically.

CREATE TABLE IF NOT EXISTS public.kaiwriter_ai_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- UTC day.
  day date NOT NULL,
  requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
  failed integer NOT NULL DEFAULT 0 CHECK (failed >= 0),
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.kaiwriter_ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kaiwriter_ai_usage_select_own ON public.kaiwriter_ai_usage;
CREATE POLICY kaiwriter_ai_usage_select_own
  ON public.kaiwriter_ai_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Count one request if the user is under p_limit today. Returns the number
-- of requests used today including this one, or -1 if the limit was reached.
CREATE OR REPLACE FUNCTION public.kaiwriter_ai_reserve(p_user uuid, p_day date, p_limit integer)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  used integer;
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RETURN -1;
  END IF;
  INSERT INTO public.kaiwriter_ai_usage AS u (user_id, day, requests)
  VALUES (p_user, p_day, 1)
  ON CONFLICT (user_id, day) DO UPDATE
    SET requests = u.requests + 1, updated_at = now()
    WHERE u.requests < p_limit
  RETURNING u.requests INTO used;
  RETURN COALESCE(used, -1);
END;
$$;

-- Record the outcome of a reserved request: add its tokens, and give the
-- request back (p_refund) when the provider failed without doing any work.
CREATE OR REPLACE FUNCTION public.kaiwriter_ai_finish(
  p_user uuid,
  p_day date,
  p_input_tokens integer,
  p_output_tokens integer,
  p_refund boolean
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.kaiwriter_ai_usage
  SET input_tokens = input_tokens + GREATEST(COALESCE(p_input_tokens, 0), 0),
      output_tokens = output_tokens + GREATEST(COALESCE(p_output_tokens, 0), 0),
      requests = CASE WHEN p_refund THEN GREATEST(requests - 1, 0) ELSE requests END,
      failed = failed + CASE WHEN p_refund THEN 1 ELSE 0 END,
      updated_at = now()
  WHERE user_id = p_user AND day = p_day;
END;
$$;

-- Only the service role may call these (they take a user id as an argument).
REVOKE ALL ON FUNCTION public.kaiwriter_ai_reserve(uuid, date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kaiwriter_ai_finish(uuid, date, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kaiwriter_ai_reserve(uuid, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.kaiwriter_ai_finish(uuid, date, integer, integer, boolean) TO service_role;
