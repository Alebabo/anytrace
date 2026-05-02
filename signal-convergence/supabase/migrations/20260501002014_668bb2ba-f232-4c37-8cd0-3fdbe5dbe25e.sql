DROP POLICY IF EXISTS "Authenticated users can read signals" ON public.signals;

CREATE POLICY "Anyone can read signals"
  ON public.signals
  FOR SELECT
  TO anon, authenticated
  USING (true);