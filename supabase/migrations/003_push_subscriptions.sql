-- Push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES participants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('host', 'participant')),
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- El cliente solo puede SUSCRIBIRSE (insert) y darse de baja (delete su endpoint).
-- La LECTURA queda cerrada: /api/push/send lee con la service-role key (salta RLS),
-- así no exponemos endpoint + claves (p256dh, auth) a cualquiera con la anon key.
CREATE POLICY "Anyone can insert subscriptions"
  ON push_subscriptions FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can delete subscriptions"
  ON push_subscriptions FOR DELETE USING (true);
