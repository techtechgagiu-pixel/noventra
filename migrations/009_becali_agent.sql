-- Twelfth voting agent: GIGI BECALI, "Patronul" (user request 2026-10-21).
INSERT INTO agents (id, name, title, risk_preference, voting, accent) VALUES
  ('becali','Gigi Becali','Patronul',75,true,'#c084fc')
ON CONFLICT (id) DO NOTHING;
