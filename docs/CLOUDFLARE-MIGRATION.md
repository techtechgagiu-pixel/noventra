# PRIMUL 11 — mutare Cloudflare, staging hibrid

Stare 26 octombrie 2026: utilizatorul a activat separat planul plătit Cloudflare, iar panoul D1 confirmă 50M scrieri incluse/lună. **Importul istoric complet:26 tabele /82.933 rânduri**, recitite remote și comparate integral, zero diferențe/FK rupte. Migrările D1 0001–0007 sunt aplicate pe ținta izolată. Codul include acum și ultima versiune publicată cu identități de modele AI.

**Producția rămâne Render + Neon.** Există acum un Worker remote de validare, `primul11-validation`, protejat printr-o cheie privată în header, inclusiv înainte de instalarea secretelor. Bridge-ul are separat HMAC. Cron este gol, runnerul nu este conectat și nicio analiză AI reală nu a fost pornită.15pagini/API-uri trec cu sesiune sintetică obișnuită; admin refuzat403, bridge nesemnat401. Verzi/roșii/NO_BET/pending și recordul de carieră al tuturor34agenți coincid cu copia istorică sursă. Google OAuth real și ciclul real de trezire/recuperare Render rămân de verificat. Workflow-ul remote `migration-check-20261026` a finalizat cu succes mentenanța și30pagini de rezultate, fără retry/eroare; a raportat încă lucru restant (`moreWork:true`). Această probă modifică numai copia izolată; Cron rămâne oprit și nu înseamnă că întreg backlogul a fost actualizat.

Snapshotul este istoric: producția a primit între timp date noi. Cutoverul necesită oprirea coordonată a scrierilor și snapshot/reconciliere finală. Nu conecta runnerul la copia de validare și nu schimba DNS înainte de acești pași. Datele private/secretele sunt în afara Git, cu permisiuni restrictive; numai numele lor apar în configurațiile versionate.

## Arhitectura pregătită

- **Site și date:** Next 16.4.2 / React 19.2.0, OpenNext 1.20.13, Cloudflare Workers + D1.
- **Analize lungi:** serviciul web Render existent execută joburile cerute explicit de utilizatori. Nu se creează serviciu Render Background Worker plătit. Păstrează pașii, modelele, rolurile, consensul și checkpointurile pipeline-ului existent.
- **Acces Render la date:** POST semnat HMAC-SHA256 la `/_internal/database`, TLS, termen de 60 s, nonce unic, corp limitat la 2 MB. Se folosesc query-uri pregătite și loturi D1 native, atomice; DDL și declarațiile multiple sunt respinse. Secretul permite acces intern la baza aplicației, asemenea vechilor credențiale PostgreSQL: numai în secretele serverelor, niciodată în browser. Nu se dă tokenul contului Cloudflare serviciului Render. Reîncercarea automată a unei scrieri cu răspuns pierdut este interzisă.
- **Rezultate:** `SettlementWorkflow`, pagini de maximum două meciuri și două seturi de date suplimentare, maximum 30 pagini per execuție. Scoruri confirmate, fără presupuneri după ora meciului. Folosește lease în D1 și înregistrează succesul/erorile în `automation_runs`. Dispecerul programat acceptă livrări duplicate fără să creeze două instanțe.
- **Programare:** expresia de activat după validarea producției este `*/5 * * * *`. **În configurația de staging lista crons este goală**, ca să nu existe automatizări active prematur. Handlerul și Workflow-ul au fost invocate local în workerd, inclusiv repetat.
- **Trezire Render:** la cereri relevante de catalog/creare/reluare se apelează numai GET `/api/health` al originii Render configurate. Programarea trezește runnerul dacă există joburi autorizate restante; nu îl ține activ când coada este goală. Render poate avea pornire lentă, iar o analiză poate aștepta următoarea verificare.
- **Catalog:** cererile Cloudflare citesc oferta persistată în D1. Render o actualizează la pornire/trezire, maximum o dată pe oră, cu lease comun și inserări grupate. Nu se descarcă toate cele 77 de ligi într-o cerere de pagină Cloudflare. The Odds API rămâne catalog informativ; în Cloudflare se citește cache-ul, fără refresh de fundal suspendat după răspuns.
- **Buget:** D1 rezervă atomic o estimare conservatoare înainte de fiecare apel OpenRouter plătit, în microdolari; ajustează după tokenii confirmați. Rezultatele de rețea incerte rămân rezervate. Pragul rămâne cel existent, implicit 5 USD/zi. Tarifele sunt cele din catalogul aplicației, deci nu înlocuiesc limita de cheie configurată la furnizor; verifică tarifele înainte de producție. Un model plătit fără preț configurat trece la fallback. Nu există promisiune de exact-once pentru facturarea API-urilor externe.

Rezumatele explicite ale biletelor folosesc și ruta existentă de rezumat; aceasta poate efectua un apel AI din Worker. Pipeline-ul lung de analiză este cel delegat Render. Dacă măsurătorile Free nu permit ruta de rezumat, trebuie delegată și ea înainte de activare.

## Staging și verificări

D1 **primul11-staging**, ID `bbd70eca-6c37-4915-9cdd-95ac477019e9`, jurisdicție UE / EEUR. Migrările 0001–0006 sunt aplicate. Conține configurația publică a **34 agenți și 77 ligi**, **zero utilizatori și zero bilete**; FK verificate. Nu conține date din Neon sau DEMO.

Ținta separată pentru date reale este **primul11-migration-20261025**, ID `1db26a07-ef43-4406-9387-46385f476571`, UE /EEUR. Baseline0001 a fost aplicat înainte de import. Întreg snapshotul82.933rânduri a fost reexportat remote și fiecare valoare comparată cu conversia sursă:identic, FK0, integritatea reexportului local ok. `PRAGMA integrity_check` este refuzat remote (SQLITE_AUTH), deci nu se pretinde execuție remote reușită. După comparație, migrările0002–0007 au adăugat configurațiile actuale, metadatele bridge/coordonare/buget și prompturile `v5.3-model-identities`, păstrând asignările existente.0007 actualizează numai etichetele și adaugă configurații lipsă, fără rescrierea rezultatelor.

`wrangler.validation.jsonc` publică numai Workerul protejat de validare pe `primul11-validation.techguythe0.workers.dev`, cu limita CPU1000ms și fără Cron/runner. `VALIDATION_SECRET` și `D1_BRIDGE_SECRET` sunt secrete separate. Nu există chei AI reale în acest Worker de validare. Nu este domeniul de producție.

Verificările locale acoperă autentificarea și revocarea invitațiilor, exact 7 zile de valabilitate, Google fără drepturi admin, ultima rundă/analiză și luna românească în statistici, istoric incomplet, evenimente concurente fără goluri, limita de 20 Custom, retry stabil peste miezul nopții, continuarea atomică, finalizarea biletelor, maximum două lease-uri de job și o analiză completă prin HTTP Render–D1 cu furnizori simulați. Bugetul comun este verificat cu rezervări simultane și reglare idempotentă.

Proba OpenNext în workerd verifică 15 pagini/API-uri, refuzul accesului admin pentru o sesiune locală de tip Google, refuzul accesului nesemnat la bridge și persistența unei execuții programate. Este o sesiune sintetică locală, nu o conectare OAuth reală la Google.

Planul plătit elimină vechiul blocaj Free la import. Rămân necesare măsurători CPU/subrequests/D1 și verificarea execuției deterministe cu date reale. Timpii HTTP remote observați sunt wall time, nu CPU. Nu mări automat limitele sau planul.

Validare după sincronizarea codului cu producția:199teste unitare/integrare plus2teste pentru gate-ul privat,18teste browser,11teste Python, typecheck aplicație/Worker, build OpenNext și dry-run. Probe remote:15rute HTTP, refuz de admin pentru sesiune Google SINTETICĂ și refuz bridge nesemnat. Nu este OAuth real. Dovezi private: `remote-full-verification.json`, `remote-statistics-parity.json`, `remote-runtime-verification.json` în directorul backupului.

## Comenzi

```sh
npm ci --include=dev
npm run typecheck
npm test
npm run cf:test-conversion
npm run cf:build:staging
npm run cf:types:staging
npm run cf:typecheck:staging
npx wrangler deploy --config wrangler.staging.jsonc --dry-run
npx wrangler d1 migrations apply primul11-staging --config wrangler.staging.jsonc --local
npm run cf:preview:staging
# într-un al doilea terminal, numai localhost:
npx tsx scripts/cloudflare/smoke-staging.ts
```

Pentru local există `.dev.vars` ignorat de Git. Exemplul cu cheile necesare este în `cloudflare/staging.env.example`; copiază-l într-un fișier privat și completează-l. `ANALYSIS_RUNNER_URL` poate rămâne gol la probe fără furnizori. Tipurile bindingurilor sunt generate de Wrangler, nu scrise manual.

`wrangler.jsonc` și `npm run cf:build` păstrează previzualizarea publică restrânsă din etapa întâi, cu login/API blocate. `wrangler.staging.jsonc` este aplicația D1 completă. Ambele au `workers_dev:false`, `preview_urls:false`, fără routes. **Este publicat numai Workerul protejat `primul11-validation`; celelalte configurații nu sunt publicate.** `cf:deploy` rămâne blocat de audit. Nu modifica `productionReady` doar pentru a elimina blocajul.

## Secrete și configurare la activare

În Cloudflare: `AUTH_SECRET`, `OWNER_ACCESS_CODE_HASH`, `OWNER_EMAIL`/`ADMIN_EMAILS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `APP_BASE_URL`, `D1_BRIDGE_SECRET`, `ANALYSIS_RUNNER_URL`. Configurațiile AI necesare verificării disponibilității și rutei de rezumat folosesc secretele existente ale furnizorilor; nu le inventa și nu le publica în vars. `ODDS_API_KEY` rămâne necesară numai runnerului care reîmprospătează sursa informativă.

Pe serviciul Render existent: `BETMIND_DATABASE=d1-http`, `D1_BRIDGE_URL=https://<originea Cloudflare verificată>`, același `D1_BRIDGE_SECRET`, cheile AI/sport existente și limitele existente. **Nu seta `BETMIND_DISABLE_WORKER=1` pe runner.** `scripts/start.mjs` nu rulează migrările PostgreSQL în modul d1-http. `instrumentation` pornește numai workerul Node și refresh-ul catalogului; settlement-ul Node este dezactivat pentru D1, ca să nu dubleze Cloudflare.

Păstrează aceleași hash-uri/ID-uri/secrete de autentificare la transfer. Callback-ul Google rămâne `https://primul11.noventra.ro/auth/callback` când domeniul este mutat. OAuth și cookie-urile trebuie verificate efectiv în staging cu o origine separată, fără reutilizarea sesiunilor de producție.

## Export și import — date reale recuperate

Neon este accesibil după schimbarea făcută de utilizator la Launch; SQL și health au confirmat recuperarea. Snapshotul real conține **26 de tabele / 82.933 de rânduri**. Există și arhivă PostgreSQL nativă, citită integral cu `pg_restore` 18.6, SHA256 `0c060f0fe5bfda30758caae72d8106fe4c4dace62c7e786df0e7223e2a03d35c`. Copiile private sunt în `/Users/cristiangagiu/Desktop/PRIMUL11-backup-productie-2026-10-25/`, în afara Git, cu directoare 0700 și fișiere 0600. Nu publica arhivele, exporturile SQL sau JSONL; conțin autentificare și date de cont.

Backupurile sunt copii coerente individual, realizate în momente apropiate, fără oprirea scrierilor live. Nu sunt snapshotul final de cutover. Exportul local anterior de 26 tabele / 765 rânduri este **DEMO** și nu se folosește în locul producției.

```sh
# MIGRATION_DATABASE_URL se încarcă privat în mediu, niciodată în argumente sau jurnale.
npm run cf:export -- /private/path/primul11-snapshot
python3 scripts/cloudflare/convert-d1.py /private/path/primul11-snapshot /private/path/primul11-converted
```

Exportul este REPEATABLE READ READ ONLY cu cursor 100, JSONL, directoare 0700 și fișiere 0600. Manifestul complet se scrie după COMMIT. Conversia produce `database.sqlite`, `schema.sql`, `import.sql`, `data-only.sql`, `verification.json`; verifică fiecare rând după PK, FK, integritate, SHA256, tipuri, UTC, JSON și BIGINT. NUMERIC SQLite poate fi reprezentat double, asemenea calculelor JS. Golirea lease-urilor temporare este singura schimbare de stare intenționată.

Se blochează importul pentru tip/expresie necunoscută, date corupte, FK rupte, rând >2 MB sau bază >500 MB. PostgreSQL 18 înregistrează și constrângeri NOT NULL în `pg_constraint`: converterul verifică acordul lor cu coloanele și păstrează NOT NULL în D1. Schema reală generată este identică, octet cu octet, cu baseline 0001.

Pentru un rând valid al cărui INSERT depășește 100 KB, textul este împărțit în fragmente UTF-8 într-un tabel temporar de import obișnuit, `_p11_import_parts`, apoi reconstruit integral la INSERT; fiecare comandă rămâne sub limită. Tabelul auxiliar este eliminat la final, iar JSON/unicode/NUL/ghilimelele sunt verificate fără trunchiere. Două rânduri reale au necesitat această împărțire. SQLite rezultat are **162.193.408 bytes**; importul complet în workerd/D1 local reproduce exact toate valorile convertite.

**Import complet după upgrade:** `remote-phases/progress.json` marchează toate cele13faze finalizate,82.933importate/0rămase. Contul are acum cotă lunară plătită, confirmată în panou. Nu reexecuta loturile sau dumpul peste ținta populată. Nu s-a creat o automatizare de continuare. Celelalte aplicații împart consumul contului.

**Nu importa peste staging-ul deja populat cu configurații.** Pregătește o țintă nouă, goală. Compară schema generată cu baseline-ul 0001 și rezolvă explicit orice diferență. Aplică doar baseline-ul 0001 folosind temporar un director de migrări care conține numai acel fișier; importă apoi `data-only.sql`, care nu creează/șterge tabele și nu face upsert peste date. Verifică din nou fiecare rând și FK, apoi aplică migrările 0002–0007 din directorul normal. Bootstrap-ul agenților păstrează asignările/prompturile existente și adaugă doar lipsurile. Nu aplica migrarea 0001 peste o bază creată deja cu `import.sql`.

`verification.json` confirmă conversia locală; nu este o confirmare a egalității bazei remote. Comparația integrală remote cu snapshotul real rămâne obligatorie înainte de cutover.

## Ordinea mutării și rollback

1. Accesul Neon și backupurile reale sunt recuperate; importul istoric izolat este complet și verificat. Nu îl confunda cu sursa finală, nu înlocui datele cu DEMO.
2. Verifică integral importul izolat, login/OAuth, statistici per agent, istoricele, permisiunile și reluarea. Configurează bridge-ul și runnerul în staging separat de producție.
3. Verifică latența la trezirea Render și resursele reale ale planului activ. O analiză reală se pornește numai la cererea explicită a utilizatorului, în plafoanele existente.
4. Oprește temporar scrierile și runnerul vechi, fă snapshotul final coerent și importul final verificat. Păstrează datele sursă.
5. Configurează domeniul și bridge-ul, comută runnerul existent pe D1, activează Cron la 5 minute și verifică o execuție fără vizitatori. Schimbă DNS/rutele numai după verificările de mai sus.
6. Rollback doar prin schimbare DNS este sigur înainte de primele scrieri D1. După scrieri noi oprește scrierile și reconciliază datele înapoi înainte de revenire; altfel se pierde istoricul nou.

## Referințe

- [OpenNext / bindings](https://opennext.js.org/cloudflare/bindings)
- [D1 database API și batch](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Workflows API](https://developers.cloudflare.com/workflows/build/workers-api/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 pricing și cota zilnică, inclusiv indexuri/importuri](https://developers.cloudflare.com/d1/platform/pricing/)

## Trecerea controlată pe domeniul existent

Configurația `wrangler.production.jsonc` pregătește Workerul `primul11-app` și baza goală `primul11-production-20261026` /`8ec1fe52-2f39-46d4-9c8b-22271a5c3d4a`. Baseline0001 este aplicat; datele finale nu se presupun importate. Workerul de rezervă este accesibil pe workers.dev în mod mentenanță, fără domeniul principal și fără Cron. Cheile sunt în secretele Cloudflare, fără credențiale PostgreSQL în Worker.

`BETMIND_MAINTENANCE=1` blochează interfața/API-urile înainte de autentificare și împiedică pornirea workerului Node sau executarea programării Cloudflare. Bridge-ul păstrează propriul HMAC și rămâne disponibil pentru pregătire. Health-ul Node rămâne accesibil, dar nu reîmprospătează catalogul în mentenanță. După activarea pauzei pe Render se așteaptă oprirea instanței anterioare (drain+shutdown), se verifică absența scrierilor și abia apoi se exportă snapshotul final.

Mentenanța Cloudflare poate fi deschisă pentru verificare prin `/_migration/unlock`, cu o cheie temporară privată (`MAINTENANCE_SECRET`). Cookie-ul semnat expiră după o oră, este HttpOnly/Secure/SameSite=Lax și NU oferă sesiune de aplicație sau drepturi admin. Formularul refuză POST de altă origine. Aceasta permite verificarea Google OAuth pe același callback deja înregistrat, `https://primul11.noventra.ro/auth/callback`, cât ceilalți vizitatori văd pagina temporară de migrare.

La trecere, Render folosește `BETMIND_DATABASE=d1-http`, bridge-ul Workerului de producție și cheia sa separată. `BETMIND_RUNNER_ONLY=1` ascunde interfața de la originea directă onrender.com, păstrând `/api/health`. Clienții cu DNS vechi pentru domeniul principal pot folosi temporar aceeași aplicație pe Render cu aceeași bază D1; nu scriu în vechiul PostgreSQL. În Cloudflare, aliasul workers.dev redirecționează paginile spre domeniul canonic după scoaterea mentenanței; bridge-ul HMAC rămâne pe alias pentru runner.

După importul final recitit și comparat, se aplică migrările0002–0007, se conectează runnerul, se verifică Google OAuth real și drepturile, apoi se scoate mentenanța și se activează Cron la5minute. Se păstrează sursa Neon și backupurile; nu se șterge nimic ca parte a mutării. Întoarcerea după scrieri D1 necesită reconcilierea datelor noi.

Verificarea pregătirii a identificat și corectat două erori ale hărții: desenul unui teren cu dimensiuni negative la ascunderea panoului și blocarea chatului când harta ieșea din viewport. Un test separat verifică mesajele primite în timp ce harta nu este vizibilă.
