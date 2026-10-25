# PRIMUL 11 — mutare Cloudflare, staging hibrid

Stare 25 octombrie 2026: adaptorul D1 și legătura cu Render sunt implementate și testate local; datele reale Neon au fost recuperate și importul izolat D1 a început. **Producția nu este mutată.** DNS-ul și configurația Render rămân neschimbate. Utilizatorul a activat separat Neon Launch; agentul nu a activat abonamente și nu a inițiat apeluri AI reale.

## Arhitectura pregătită

- **Site și date:** Next 16.4.2 / React 19.2.0, OpenNext 1.20.13, Cloudflare Workers + D1.
- **Analize lungi:** serviciul web Render existent execută joburile cerute explicit de utilizatori. Nu se creează serviciu Render Background Worker plătit. Păstrează pașii, modelele, personajele, consensul și checkpointurile pipeline-ului existent.
- **Acces Render la date:** POST semnat HMAC-SHA256 la `/_internal/database`, TLS, termen de 60 s, nonce unic, corp limitat la 2 MB. Se folosesc query-uri pregătite și loturi D1 native, atomice; DDL și declarațiile multiple sunt respinse. Secretul permite acces intern la baza aplicației, asemenea vechilor credențiale PostgreSQL: numai în secretele serverelor, niciodată în browser. Nu se dă tokenul contului Cloudflare serviciului Render. Reîncercarea automată a unei scrieri cu răspuns pierdut este interzisă.
- **Rezultate:** `SettlementWorkflow`, pagini de maximum două meciuri și două seturi de date suplimentare, maximum 30 pagini per execuție. Scoruri confirmate, fără presupuneri după ora meciului. Folosește lease în D1 și înregistrează succesul/erorile în `automation_runs`. Dispecerul programat acceptă livrări duplicate fără să creeze două instanțe.
- **Programare:** expresia de activat după validarea producției este `*/5 * * * *`. **În configurația de staging lista crons este goală**, ca să nu existe automatizări active prematur. Handlerul și Workflow-ul au fost invocate local în workerd, inclusiv repetat.
- **Trezire Render:** la cereri relevante de catalog/creare/reluare se apelează numai GET `/api/health` al originii Render configurate. Programarea trezește runnerul dacă există joburi autorizate restante; nu îl ține activ când coada este goală. Render poate avea pornire lentă, iar o analiză poate aștepta următoarea verificare.
- **Catalog:** cererile Cloudflare citesc oferta persistată în D1. Render o actualizează la pornire/trezire, maximum o dată pe oră, cu lease comun și inserări grupate. Nu se descarcă toate cele 77 de ligi într-o cerere de pagină Cloudflare. The Odds API rămâne catalog informativ; în Cloudflare se citește cache-ul, fără refresh de fundal suspendat după răspuns.
- **Buget:** D1 rezervă atomic o estimare conservatoare înainte de fiecare apel OpenRouter plătit, în microdolari; ajustează după tokenii confirmați. Rezultatele de rețea incerte rămân rezervate. Pragul rămâne cel existent, implicit 5 USD/zi. Tarifele sunt cele din catalogul aplicației, deci nu înlocuiesc limita de cheie configurată la furnizor; verifică tarifele înainte de producție. Un model plătit fără preț configurat trece la fallback. Nu există promisiune de exact-once pentru facturarea API-urilor externe.

Rezumatele explicite ale biletelor folosesc și ruta existentă de rezumat; aceasta poate efectua un apel AI din Worker. Pipeline-ul lung de analiză este cel delegat Render. Dacă măsurătorile Free nu permit ruta de rezumat, trebuie delegată și ea înainte de activare.

## Staging și verificări

D1 **primul11-staging**, ID `bbd70eca-6c37-4915-9cdd-95ac477019e9`, jurisdicție UE / EEUR. Migrările 0001–0006 sunt aplicate. Conține configurația publică a **34 agenți și 77 ligi**, **zero utilizatori și zero bilete**; FK verificate. Nu conține date din Neon sau DEMO.

Ținta separată pentru date reale este **primul11-migration-20261025**, ID `1db26a07-ef43-4406-9387-46385f476571`, UE / EEUR. Baseline 0001 este aplicat și înregistrat de Wrangler. Sunt importate **12.499 de rânduri** din 23 de tabele, inclusiv cele 14 conturi și 82 de bilete. Un export remote recitit confirmă fiecare rând importat, zero FK rupte și integritate `ok`. Cele trei tabele voluminoase `agent_predictions`, `analysis_events`, `model_usage_logs` sunt încă goale: **70.434 de rânduri rămân de importat**. Migrările 0002–0006 nu sunt încă aplicate pe această țintă. Nu o conecta la site/runner și nu o prezenta drept migrare completă.

Verificările locale acoperă autentificarea și revocarea invitațiilor, exact 7 zile de valabilitate, Google fără drepturi admin, ultima rundă/analiză și luna românească în statistici, istoric incomplet, evenimente concurente fără goluri, limita de 20 Custom, retry stabil peste miezul nopții, continuarea atomică, finalizarea biletelor, maximum două lease-uri de job și o analiză completă prin HTTP Render–D1 cu furnizori simulați. Bugetul comun este verificat cu rezervări simultane și reglare idempotentă.

Proba OpenNext în workerd verifică 15 pagini/API-uri, refuzul accesului admin pentru o sesiune locală de tip Google, refuzul accesului nesemnat la bridge și persistența unei execuții programate. Este o sesiune sintetică locală, nu o conectare OAuth reală la Google.

Buildul și dry-run-ul nu demonstrează respectarea limitei CPU Free. Mai trebuie măsurate SSR, proxy-ul Node (suport experimental în OpenNext), pașii de settlement cu date reale, D1 reads/writes și volumul de istoric. Un pas are I/O limitat, dar reconcilierea rezultatelor citește și istoricul existent; poate necesita împărțire suplimentară la volume mari. Nu se activează automat un plan plătit dacă nu încape.

Verificare: **197 teste unitare/integrare, 17 teste browser, 11 teste de conversie**, typecheck aplicație/Worker, build OpenNext, dry-run și proba HTTP locală trecute. După recuperarea Neon, importul întregului snapshot real în D1 local a trecut: 26 de tabele / 82.933 de rânduri, fiecare rând comparat, FK zero și integritate `ok`. Nu s-au folosit furnizori AI reali. Corecția jurnalului include salvarea atomică a mesajului final împreună cu starea biletului și golirea tuturor evenimentelor restante înainte de închiderea stream-ului.

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

`wrangler.jsonc` și `npm run cf:build` păstrează previzualizarea publică restrânsă din etapa întâi, cu login/API blocate. `wrangler.staging.jsonc` este aplicația D1 completă. Ambele au `workers_dev:false`, `preview_urls:false`, fără routes. **Nu este publicat niciun Worker.** `cf:deploy` rămâne blocat de audit. Nu modifica `productionReady` doar pentru a elimina blocajul.

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

**Limita de import Free:** contul este Workers Free, cu 100.000 de scrieri D1/zi pentru întreg contul, inclusiv indexuri, importuri și operații de schemă. Indexurile singure fac imposibil importul integral într-o singură zi; schema curentă sugerează peste 226.000 de scrieri, înainte de unele operații interne. Prima etapă a consumat efectiv **34.934** de scrieri; înaintea ei panoul arăta aproximativ 8.360 deja folosite de cont. Nu presupune că estimările sunt plafoane exacte și nu consuma restul cotei fără a verifica utilizarea celorlalte aplicații. Resetarea este la 00:00 UTC.

În backupul privat, `remote-phases/manifest.json` descrie **13 faze** (schema + 12 loturi), cu hashuri și ordine FK; toate au fost reluate local cu FK active și comparate integral. `progress.json` marchează schema și `01-core.sql` ca deja aplicate. Următorul lot este `02-agent_predictions-1.sql`. Nu reexecuta fazele complete și nu importa `data-only.sql` peste ținta parțială. Nu există continuare programată automat. Înaintea fiecărei continuări verifică inventarul țintei, hashurile și cota zilnică disponibilă; un rezultat de rețea incert cere inspecție, nu retry orb.

**Nu importa peste staging-ul deja populat cu configurații.** Pregătește o țintă nouă, goală. Compară schema generată cu baseline-ul 0001 și rezolvă explicit orice diferență. Aplică doar baseline-ul 0001 folosind temporar un director de migrări care conține numai acel fișier; importă apoi `data-only.sql`, care nu creează/șterge tabele și nu face upsert peste date. Verifică din nou fiecare rând și FK, apoi aplică migrările 0002–0006 din directorul normal. Bootstrap-ul agenților păstrează asignările/prompturile existente și adaugă doar lipsurile. Nu aplica migrarea 0001 peste o bază creată deja cu `import.sql`.

`verification.json` confirmă conversia locală; nu este o confirmare a egalității bazei remote. Comparația integrală remote cu snapshotul real rămâne obligatorie înainte de cutover.

## Ordinea mutării și rollback

1. Accesul Neon și backupurile reale sunt recuperate; continuă importul izolat în limitele Free, fără a înlocui datele cu DEMO.
2. Verifică integral importul izolat, login/OAuth, statistici per agent, istoricele, permisiunile și reluarea. Configurează bridge-ul și runnerul în staging separat de producție.
3. Verifică latența la trezirea Render și limitele reale Free. O analiză reală se pornește numai la cererea explicită a utilizatorului, în plafoanele existente.
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
