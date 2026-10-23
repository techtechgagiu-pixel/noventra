# API-Football — catalog informativ de meciuri

## Comportament

Pagina **Meciuri** afișează programul și scorurile API-Football alături de catalogul existent ESPN/LPF. Are filtre pe sursă, ligă, zi și echipă; lista afișează inițial 120 de rânduri, cu buton pentru următoarele 120. Pentru rezultate se debifează „ascunde meciurile terminate”.

Sursele se deduplică după echipe normalizate, aceeași ordine gazdă/oaspete și o diferență de cel mult 10 minute între ore. Se păstrează identificatorii, scorurile și adnotările existente ESPN/LPF. Echipele feminine, juniorii și rezervele nu sunt echivalate cu echipa principală. Aliasurile diferite semantic pot apărea separat; nu se folosesc potriviri aproximative agresive.

## Izolare

- Doar `GET /api/matches?includeInformational=1` adaugă această sursă; pagina Meciuri cere explicit această variantă.
- `GET /api/matches` folosit de formularul Custom și `fixtureCatalog()` rămân pe datele existente.
- `FixtureProvider`, `loadFixtures`, motorul agenților și generarea biletelor nu au fost modificate.
- Datele suplimentare stau în `sports_catalog_cache`, nu în `fixtures`, `odds_snapshots` sau tabelele de predicții. Rândurile au `source: api-football`, `odds: null`, `analysis: null`.
- Furnizorul este apelat doar la endpointul `/fixtures`; nu se cer cote sau pronosticuri.

## Configurare și consum

- Variabilă secretă exclusiv pe server: `API_FOOTBALL_KEY`. Valoarea se configurează prin setările serviciului Render existent; fișierul Blueprint nu este modificat. Nu există chei în Git.
- Migrarea aditivă `016_sports_catalog_cache.sql` se aplică automat la pornire prin mecanismul existent.
- API-Football: azi și mâine în calendarul Europe/Bucharest; prima încărcare cere câte o zi pe apel. Verificat pe contul Free: accesul la poimâine este refuzat explicit de furnizor, care permite ieri–mâine. ESPN/LPF păstrează intervalul de 8 zile. Nu se repetă cereri pentru zilele nepermise.
- Cache persistent: 30 de minute pentru ziua curentă, 6 ore pentru zilele viitoare. Actualizarea este declanșată la citirea paginii; nu este un flux live și nu ține serverul Render treaz.
- Buget comun de maximum 90 de cereri/zi UTC, rezervat atomic în `provider_usage` înainte de fiecare apel. Marjă de 10 cereri față de planul Free de 100. Antetul furnizorului ajustează contorul pentru consum extern când este disponibil.
- Blocare comună în PostgreSQL de 5 minute pentru a evita descărcări paralele; timeout de 12 secunde pe apel. Fiecare zi încărcată devine vizibilă imediat în cache.
- Erorile păstrează ultima copie și amână o nouă încercare 15 minute. La epuizarea bugetului se așteaptă următoarea zi UTC. ESPN/LPF rămân disponibile.
- Traficul altor aplicații cu aceeași cheie poate consuma marja; limitele locale nu pot controla acele aplicații.

## Verificare

- 21 teste unitare/de integrare pentru catalog: maparea stărilor și scorurilor, date locale/DST, duplicate, izolare, cititori concurenți, blocare, buget, consum extern, date expirate, indisponibilitatea sursei și limitarea la zilele permise de planul Free.
- Build Next.js de producție reușit, inclusiv verificare TypeScript.
- Verificare în Chrome cu 245 de meciuri fictive într-o bază locală separată: filtru sursă, 120 → 240 de rânduri, căutare, afișarea scorului final după debifarea ascunderii meciurilor terminate; fără erori în consolă.

## Revenire

Eliminarea cheii din setările serviciului și un deploy dezactivează sursa suplimentară. Migrarea poate rămâne instalată; este compatibilă cu versiunea anterioară. Nicio analiză existentă nu este modificată.
