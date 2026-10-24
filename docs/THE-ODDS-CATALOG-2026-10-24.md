# The Odds API — catalog informativ, 24 octombrie 2026

## Schimbare

API-Football a fost eliminat la cererea administratorului: adaptorul și apelurile lui au fost scoase din cod, opțiunea din Meciuri a fost înlocuită, iar vechea cheie este dezactivată în configurația Render. Cache-ul istoric nu mai este citit. Documentele anterioare rămân rapoarte istorice.

Sursa nouă este **The Odds API** (`the-odds-api.com`), furnizor diferit de Odds-API.io și de MCP-ul acestuia. Integrarea folosește direct API-ul REST pe server; nu necesită un proces MCP, un SDK nou sau infrastructură suplimentară.

Pagina Meciuri afișează programul din competițiile de fotbal active alături de ESPN/LPF. Filtre: toate sursele, ESPN/LPF și The Odds API. Când același meci există în ambele surse, rămâne un singur rând cu proveniența ambelor; datele ESPN/LPF, scorurile și adnotările existente au prioritate. O potrivire cere echipe echivalente, aceeași ordine gazdă/oaspete și ore la maximum 10 minute. Junioarele, juniorii și rezervele rămân distincte.

## Date și cost

- `ODDS_API_KEY` este exclusiv pe server, configurată în setările serviciului Render existent; nu apare în Git sau în răspunsurile API ale aplicației.
- Singurele cereri externe sunt `GET /v4/sports` și `GET /v4/sports/{soccer_key}/events`. Ambele au cost zero în creditele furnizorului. Verificarea inițială a cheii a întors 500 disponibile, 0 folosite și cost 0 pentru ambele apeluri, cu 46 de competiții active de fotbal.
- Sunt excluse alte sporturi și competițiile de tip outrights. Nu se cer cote, scoruri, rezultate istorice, recomandări sau legături către bookmakeri.
- Lista suplimentară este un **program informativ**. Pentru un meci cu ora de start depășită, starea este necunoscută și scorul indisponibil; ora nu este transformată într-un rezultat sau într-o etichetă LIVE.
- Cache PostgreSQL în `sports_catalog_cache`, provider `the-odds-api`; metadate zilnice și competiții reîmprospătate la circa o oră la citire. Blocare între procese, maximum patru cereri/secundă și limită de timp pentru o etapă. Datele deja salvate sunt afișate în timpul încărcării.
- Erorile păstrează ultimul program și amână următoarea încercare. Mesajele furnizorului și adresele cu cheia nu sunt logate sau trimise clientului. Un cost neașteptat raportat de furnizor oprește etapa de actualizare.
- Fără abonamente sau servicii noi. Render Free poate dormi; nu se promite un flux live.

## Izolare

Numai `GET /api/matches?includeInformational=1`, folosit de Meciuri, citește sursa nouă. Endpointul implicit, formularul Custom, `fixtureCatalog()`, `loadFixtures`, agenții și generarea biletelor nu primesc aceste date. Rândurile suplimentare nu intră în `fixtures`, predicții sau bilete și au `odds:null`, `analysis:null`.

## Verificare

15 teste unitare/de integrare pentru validarea datelor, selecția competițiilor, date locale/DST, evitarea duplicatelor, păstrarea provenienței, cache, cititori concurenți, blocare, erori, protejarea creditelor, izolarea de agenți și ignorarea cache-ului vechi API-Football. Build Next.js/TypeScript și verificare vizuală înainte de publicare.

Nu sunt necesare migrații noi; se reutilizează tabelul de cache instalat prin migrarea 016. Pentru dezactivarea sursei, se golește `ODDS_API_KEY` în Render și se face un deploy.
