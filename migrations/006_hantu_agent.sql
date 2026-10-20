-- Eleventh voting agent: HANȚU, works only from real sports-news headlines (user request 2026-10-20).
INSERT INTO agents (id, name, title, risk_preference, voting, accent) VALUES
  ('hantu','Hanțu','Omul de știri',35,true,'#84cc16')
ON CONFLICT (id) DO NOTHING;
