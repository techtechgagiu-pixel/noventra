-- Curated TOP 10 priority set (including Romania). Not a claim about the live UEFA ranking.
-- provider_key values verified against the ESPN soccer catalog on 2026-10-19.
-- ESPN rou.1 is stale (last events 2025-09), so Romania uses the official LPF schedule (lpf.ro), which has no odds.
INSERT INTO leagues (id, country, name, provider, provider_key, priority, top10) VALUES
  ('ENG1','Anglia','Premier League','espn','eng.1',1,true),
  ('ESP1','Spania','La Liga','espn','esp.1',2,true),
  ('ITA1','Italia','Serie A','espn','ita.1',3,true),
  ('GER1','Germania','Bundesliga','espn','ger.1',4,true),
  ('FRA1','Franța','Ligue 1','espn','fra.1',5,true),
  ('POR1','Portugalia','Primeira Liga','espn','por.1',6,true),
  ('NED1','Olanda','Eredivisie','espn','ned.1',7,true),
  ('BEL1','Belgia','Pro League','espn','bel.1',8,true),
  ('TUR1','Turcia','Süper Lig','espn','tur.1',9,true),
  ('ROU1','România','SuperLiga','lpf','superliga',10,true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO agents (id, name, title, risk_preference, voting, accent) VALUES
  ('victor','Victor','Strategul',20,true,'#34d399'),
  ('andrei','Andrei','Matematicianul',60,true,'#60a5fa'),
  ('mihai','Mihai','Veteranul',40,true,'#f59e0b'),
  ('alex','Alex','Vânătorul de cote',90,true,'#f87171'),
  ('diana','Diana','Tacticiana',50,true,'#a78bfa'),
  ('robert','Robert','Managerul de risc',10,true,'#cbd5e1'),
  ('scout','SCOUT','Cercetare istorică',0,false,'#22d3ee')
ON CONFLICT (id) DO NOTHING;
