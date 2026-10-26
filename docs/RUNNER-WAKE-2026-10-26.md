# Incident — analize rămase în coadă, 26 octombrie 2026

## Cauză și corecție

Funcția Cloudflare care trezea runnerul Render folosea `fetch(..., { redirect: 'error' })`. Runtime-ul workerd respingea această valoare cu TypeError înainte de orice cerere HTTP. Excepția era mascată drept `starting`, deși nu se trimitea un wake. Verificările Node cu fetch standard nu reproduceau incompatibilitatea.

Codul folosește acum `redirect:'manual'`: cererea rămâne pe originea Render configurată, iar un redirect este raportat prin status, fără a fi urmat. Fereastra de așteptare este25s, în interiorul duratei waitUntil de30s. Rezultatul include statusul HTTP sau motivul erorii pentru diagnostic. Nu adaugă servicii, chei sau bilete.

Verificarea la5minute trezește runnerul și pentru joburi RUNNING cu lease valid. Existența numai a ultimelor analize active trebuie să prevină adormirea Render Free; conexiunile AI inițiate spre exterior nu țin singure serviciul activ.

## Recuperare și dovezi

- Lotul cerut de utilizator la14:05:53UTC conținea5joburi. Un GET manual health a trezit Render la14:09; primele două joburi au fost preluate la14:09:24. Nu s-a recreat lotul și nu s-au modificat predicții/rezultate.
- Diagnosticul din Workflow a confirmat explicit TypeError pentru redirect. După corecție, Workflow `runner-fixed-20261026-1419` a returnat `queued:5`, `wake.status:awake`, `httpStatus:200`, fără retry.
- Versiune Worker cu fixul: `ce05a20e-6d06-46cc-8914-545ebf920729`. Codul de wake rulează în Cloudflare; runnerul Node activ nu a fost întrerupt pentru remediere.
- La14:20:58UTC primul job al lotului era COMPLETED/DONE,176evenimente; celelalte patru avansau cu checkpointuri și fără last_error. La14:25:31UTC, toate cele5joburi erau COMPLETED/DONE, fiecare cu un bilet COMPLETED de4selecții, fără last_error. Verificat atât în D1, cât și în interfața lotului.
- Separat, logurile reale au arătat timeouturi repetate de120s pentru `cohere/command-r-08-2024`. S-a pus o pauză temporară în model_health până la14:33:53UTC, folosind fallback-ul deja atribuit; asignarea principală nu a fost schimbată. Acesta este un remediu temporar pentru ruta externă lentă.

## Verificare

Două teste unitare acoperă compatibilitatea modului de redirect, redirectul neașteptat, erorile de rețea și validarea originii. Integrarea D1 reală simulată prin workerd verifică un singur job RUNNING cu lease valid, fără coadă, și confirmă wake; împreună cu testele existente de bridge/claim/pipeline sunt6teste trecute. Typecheck Worker și publicarea în producție au trecut. Nu se modifică praguri, cote, surse, bugete sau rezultate pentru a forța finalizarea.
