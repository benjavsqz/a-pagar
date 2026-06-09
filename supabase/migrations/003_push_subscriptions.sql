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

CREATE POLICY "Anyone can insert subscriptions"
  ON push_subscriptions FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read subscriptions"
  ON push_subscriptions FOR SELECT USING (true);

CREATE POLICY "Anyone can delete subscriptions"
  ON push_subscriptions FOR DELETE USING (true);
