-- Enum für Signal-Typen
CREATE TYPE public.signal_kind AS ENUM (
  'Hackathon winner',
  'Seed round',
  'Pre-seed round',
  'Publication',
  'Open source traction',
  'Product launch'
);

CREATE TYPE public.signal_confidence AS ENUM ('high', 'medium', 'low');

-- Signals Tabelle
CREATE TABLE public.signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id TEXT NOT NULL,
  source TEXT NOT NULL,
  kind public.signal_kind NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  entity TEXT NOT NULL DEFAULT '',
  geography TEXT NOT NULL DEFAULT 'Global',
  source_url TEXT NOT NULL,
  confidence public.signal_confidence NOT NULL DEFAULT 'medium',
  tags TEXT[] NOT NULL DEFAULT '{}',
  evidence_snippet TEXT NOT NULL DEFAULT '',
  why_matters TEXT NOT NULL DEFAULT '',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE INDEX idx_signals_observed_at ON public.signals (observed_at DESC);
CREATE INDEX idx_signals_kind ON public.signals (kind);
CREATE INDEX idx_signals_tags ON public.signals USING GIN (tags);

-- RLS aktivieren
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

-- Lesen: alle eingeloggten Nutzer
CREATE POLICY "Authenticated users can read signals"
  ON public.signals
  FOR SELECT
  TO authenticated
  USING (true);

-- Kein direktes Insert/Update/Delete vom Client — nur Service-Role (Edge Function) darf schreiben
-- Service-Role bypasst RLS automatisch, also brauchen wir keine explizite Policy

-- Updated-at Trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_signals_updated_at
  BEFORE UPDATE ON public.signals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();