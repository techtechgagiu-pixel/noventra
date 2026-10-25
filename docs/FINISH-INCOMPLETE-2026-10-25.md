# Finalizarea biletelor incomplete și simplificarea navigării

Butonul **Finalizează biletul** apare pentru creator în lista de bilete, în detaliul unui bilet incomplet și la finalul analizei. Continuă același job și actualizează același bilet, fără să consume un slot nou din limita zilnică de 20 de bilete custom. Folosirea AI rămâne supusă bugetelor și cozii existente.

## Reguli

- Se păstrează ținta, echipa, setările, istoricul dezbaterii, predicțiile și voturile. O încercare nouă caută meciuri neanalizate în intervalul relativ ales, pornind de la momentul finalizării.
- Selecțiile acceptate anterior sunt reverificate: meci viitor, aceeași piață disponibilă, cotă recentă, limitele agenților și consens încă valide. Ele formează o rezervă de candidați; optimizatorul poate alege o parte dintre ele.
- Meciurile începute, dispărute, cotele vechi și piețele incompatibile rămân în istoric și nu sunt promovate într-un bilet final.
- Dacă lipsesc suficiente selecții valide, biletul rămâne incomplet. Nu se inventează piețe, cote sau consens.
- O finalizare întreruptă în pauză/eroare se reia din checkpoint. Solicitările simultane returnează același job.
- Endpoint: `POST /api/tickets/[id]/complete`, autentificare, proprietar, verificare de origine și limită de frecvență. Se blochează rândul jobului, apoi se recitește starea biletului; ordinea evită blocajul cu workerul care salvează întâi biletul.
- Furnizorii informativi nu sunt adăugați la sursele agenților.

## Navigare

Tabul global **Azi** este eliminat. URL-urile vechi `/?tab=azi` deschid **Bilete create**, inclusiv detaliul indicat prin `ticket`. Filtrul de dată **Azi** din arhivă rămâne disponibil.

## Verificare

Șapte teste de integrare acoperă finalizarea în același bilet, păstrarea predicțiilor, cererile simultane, proprietarul, checkpointul, patru variante de selecții vechi nevalide și blocarea concurentă a biletului de către worker. Suita completă și buildul trebuie să treacă înainte de publicare. Verificarea UI a pornirii folosește exclusiv date locale sintetice, cu workerul dezactivat; nu pornește analize AI în producție.
