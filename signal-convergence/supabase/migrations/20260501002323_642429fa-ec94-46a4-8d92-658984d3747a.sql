ALTER TABLE public.signals 
  ADD COLUMN IF NOT EXISTS person_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS person_role TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_signals_person_name ON public.signals(person_name) WHERE person_name <> '';
CREATE INDEX IF NOT EXISTS idx_signals_observed_at ON public.signals(observed_at DESC);