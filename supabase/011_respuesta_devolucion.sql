ALTER TABLE public.payment_batches
  ADD COLUMN IF NOT EXISTS respuesta_devolucion text;
