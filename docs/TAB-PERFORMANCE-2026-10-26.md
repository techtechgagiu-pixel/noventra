# Navigare mai rapidă — 26 octombrie 2026

Publicat pe Workerul de producție `primul11-app`, versiune `bba7c57d-4ea2-4c2f-9e5d-0da3a10161ff`. Nu schimbă infrastructura, modelele, consensul, limitele sau programarea rezultatelor.

## Ce s-a schimbat

- Taburile au feedback imediat la apăsare și prefetch doar la hover/focus. Nu se descarcă preventiv toate cele șapte secțiuni.
- Conținutul tabului este transmis separat de navigare, prin Suspense cu cheie pentru tab și filtre. Autentificarea și redirecționarea rămân înaintea acestei limite; nu adăuga un loading global care începe răspunsul înaintea verificării accesului.
- Statistici nu mai serializează în browser întregul istoric al tuturor agenților. `GET /api/agents/:id/history?month=…&scope=…` îl încarcă numai la deschidere, cu aceleași reguli de lună/sferă ca în clasament. Are autentificare, erori cu reîncercare și anularea cererii la închidere. O revizie hash actualizează un istoric deschis când se schimbă datele; fără cache global între utilizatori. API-ul Statistics existent își păstrează răspunsul complet.
- Clasamentul Top6 din Custom folosește agregate identice clasamentului complet, fără jurnale de consum sau toate istoricele. Datele independente se citesc în paralel.
- Alegerea poziției finale pe meci păstrează aceeași ordine de runde/analize, dar sortează identificatori și metadate mici, apoi citește payload-ul numai pentru pozițiile finale. Nu materializează JSON-ul mare în ambele sortări.
- Filtrele lunare folosesc navigare internă Next Link.

## Măsurători pe site-ul real

| Secțiune | Înainte | După |
|---|---:|---:|
| Custom, răspuns complet median | 1.415 ms | 745 ms |
| Statistici, răspuns complet median | 1.273 ms | 1.038 ms |
| Statistici, primele date HTTP median | 1.259 ms | 153 ms |
| Statistici, HTML decodat inițial | 3.135.478 bytes | 316.893 bytes |

Două mostre înainte și patru după pentru fiecare secțiune; toate mostrele, inclusiv o valoare Custom mai lentă, intră în mediană. Acestea sunt cereri HTTP autentificate de la același client, cu corpul complet citit, nu Core Web Vitals, timpi de paint sau un test de încărcare. Rețeaua și pornirea unui isolate pot produce variații. Date brute sumarizate în [tab-performance-2026-10-26.json](tab-performance-2026-10-26.json).

## Verificare

207 teste unitare/integrare și21 teste browser trec, inclusiv istoric lazy/retry/sferă personală, feedback pentru navigare întârziată și consistența existentă a cardurilor. Build Node/OpenNext și typecheck Worker trec. Noul SQL alege exact aceleași ID-uri finale în15sfere din D1 real (comunitate+14conturi), comparate în loturi atomice de citire. Șase comparații ale endpointului nou cu Statistics (trei agenți, comunitate/personal) sunt identice; anonim401 și redirecționare307 spre login pe tab privat. Nu s-au pornit inferențe AI reale.
