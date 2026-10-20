-- Extended fixture pool (user request 2026-10-20): every league with real odds at the source, beyond the TOP 10.
-- top10=false marks them as "extended"; both sets are used for ticket generation.
INSERT INTO leagues (id, country, name, provider, provider_key, priority, top10) VALUES
  ('UCL','Europa','Champions League','espn','uefa.champions',11,false),
  ('UEL','Europa','Europa League','espn','uefa.europa',12,false),
  ('UECL','Europa','Conference League','espn','uefa.europa.conf',13,false),
  ('ENG2','Anglia','Championship','espn','eng.2',14,false),
  ('GER2','Germania','2. Bundesliga','espn','ger.2',15,false),
  ('ITA2','Italia','Serie B','espn','ita.2',16,false),
  ('ESP2','Spania','LaLiga 2','espn','esp.2',17,false),
  ('FRA2','Franța','Ligue 2','espn','fra.2',18,false),
  ('NED2','Olanda','Eerste Divisie','espn','ned.2',19,false),
  ('SCO1','Scoția','Premiership','espn','sco.1',20,false),
  ('AUT1','Austria','Bundesliga','espn','aut.1',21,false),
  ('DEN1','Danemarca','Superliga','espn','den.1',22,false),
  ('GRE1','Grecia','Super League','espn','gre.1',23,false),
  ('NOR1','Norvegia','Eliteserien','espn','nor.1',24,false),
  ('SWE1','Suedia','Allsvenskan','espn','swe.1',25,false)
ON CONFLICT (id) DO NOTHING;

-- Ten voting agents (user request 2026-10-20).
INSERT INTO agents (id, name, title, risk_preference, voting, accent) VALUES
  ('ioana','Ioana','Specialista în goluri',45,true,'#f472b6'),
  ('radu','Radu','Analistul acasă/deplasare',30,true,'#2dd4bf'),
  ('elena','Elena','Statisticiana bayesiană',35,true,'#facc15'),
  ('cosmin','Cosmin','Analistul de piață',70,true,'#fb923c')
ON CONFLICT (id) DO NOTHING;
