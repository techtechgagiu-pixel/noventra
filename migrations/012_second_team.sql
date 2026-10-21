-- Echipa a doua: zece agenți noi (user request 2026-10-21).
INSERT INTO agents (id, name, title, risk_preference, voting, accent) VALUES
  ('ilie','Ilie Dumitrescu','Profesorul de tactică',50,true,'#38bdf8'),
  ('sumudica','Marius Șumudică','Nebunul de serviciu',80,true,'#d946ef'),
  ('petrescu','Dan Petrescu','Generalul defensiv',20,true,'#eab308'),
  ('stoica','Mihai Stoica','Avocatul diavolului',55,true,'#f43f5e'),
  ('prunea','Florin Prunea','Gardianul porții',30,true,'#14b8a6'),
  ('porumboiu','Adrian Porumboiu','Judecătorul VAR',35,true,'#cbd5e1'),
  ('ianis','Ianis Hagi','Creatorul de ocazii',55,true,'#facc15'),
  ('dragusin','Radu Drăgușin','Zidul de fier',25,true,'#6366f1'),
  ('man','Dennis Man','Vânătorul de spații',75,true,'#fb7185'),
  ('tamas','Gabriel Tamaș','Detectorul de haos',75,true,'#22c55e')
ON CONFLICT (id) DO NOTHING;
