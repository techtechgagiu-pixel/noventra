-- Ten original AI identities; existing agents and histories stay intact.
INSERT INTO agents (id,name,title,risk_preference,voting,accent) VALUES
  ('nova','Nova','Contrarianul AI · Identitate AI originală',55,true,'#e4a15c'),
  ('sigma','Sigma','Auditorul statistic · Identitate AI originală',30,true,'#8eafff'),
  ('atlas','Atlas','Analistul de actualitate · Identitate AI originală',35,true,'#6edbc4'),
  ('argus','Argus','Criticul dovezilor · Identitate AI originală',20,true,'#d7b4a0'),
  ('orion','Orion','Auditorul regulilor · Identitate AI originală',25,true,'#a6c5fa'),
  ('prisma','Prisma','Interpreta piețelor · Identitate AI originală',40,true,'#b8a5f0'),
  ('mnemos','Mnemos','Memoria dezbaterii · Identitate AI originală',35,true,'#c2a6df'),
  ('nexus','Nexus','Mediatorul AI · Identitate AI originală',30,true,'#8ac86e'),
  ('vector','Vector','Analistul de scenarii · Identitate AI originală',45,true,'#ed9a71'),
  ('fulger','Fulger','Inspectorul rapid · Identitate AI originală',25,true,'#e1da81')
ON CONFLICT (id) DO NOTHING;
