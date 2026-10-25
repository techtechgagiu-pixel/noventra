# PRIMUL 11 — pregătirea mutării pe Cloudflare

Stare la 25 octombrie 2026: **pregătire verificată, migrarea aplicației nu este încă terminată**.
Render/Neon și DNS-ul de producție nu au fost modificate. Nu s-a activat niciun abonament.

## Ce există și ce s-a verificat

- Build OpenNext 1.20.13 pentru Next 16.4.2 / React 19.2.0. Vinext 1.3.0 a fost evaluat, dar cere React >=19.3.1; nu am forțat actualizarea aplicației existente.
- Wrangler 4.152.0, configurare fără domeniu, fără adresă publică workers.dev și fără servicii R2/Images plătite/provizionate. Varianta Render își păstrează comenzile existente.
- Previzualizare locală în workerd: prezentarea publică și paginile legale. Etichetată explicit, fără cookies/autorizare transmise mai departe; orice login/API/operație de scriere primește 503. `/api/migration-readiness` spune explicit `productionReady:false`.
- `instrumentation.ts` nu pornește intervalele Node și nu actualizează configurația agenților în runtime-ul Cloudflare. Nu se pornesc apeluri AI reale.
- D1 **primul11-staging**, ID `bbd70eca-6c37-4915-9cdd-95ac477019e9`, jurisdicție UE, regiune EEUR. Schema cu 26 tabele este aplicată și verificată; **zero conturi și zero bilete**. Migrarea D1 este separată de migrările PostgreSQL.
- Export local DEMO: 26 tabele / 765 înregistrări; conversie SQLite 782336 bytes, verificare FK/integritate și comparație a fiecărui rând. Import în D1 local reușit. Acestea **nu sunt datele reale din Neon**.
- 185 teste Vitest, 8 teste Python de conversie, typecheck Next și Worker, build OpenNext și `wrangler deploy --dry-run` reușite. Nu s-a publicat un Worker.

## Instrumente gata de folosit

```sh
npm ci --include=dev
npm run cf:build
npm run cf:typecheck
npm run cf:preview
# http://localhost:8787 — numai prezentarea, nu aplicația cu date
npm run cf:test-conversion
npm run cf:audit
```

`npm run cf:deploy` este blocat intenționat de audit cât timp lipsesc adaptorul D1, execuția de fundal și validarea de staging. Nu modifica `productionReady` doar pentru a trece această verificare.

### Exportul sursei, când Neon acceptă conexiuni

Secretul `MIGRATION_DATABASE_URL` trebuie încărcat în mediu dintr-o sursă privată, fără a fi pus în argumente, Git, chat sau jurnale. Nu folosi baza locală DEMO ca înlocuitor pentru producție.

```sh
# director NOU; directorul părinte trebuie să existe, în afara Git/public
npm run cf:export -- /private/path/primul11-snapshot
python3 scripts/cloudflare/convert-d1.py /private/path/primul11-snapshot /private/path/primul11-converted
```

Exportul folosește o tranzacție **REPEATABLE READ READ ONLY**, citire cu cursor de 100 rânduri și fișiere JSONL; nu modifică sursa. Manifestul `complete:true` apare abia după toate tabelele și COMMIT. Snapshotul păstrează JSON brut, BIGINT, ID-uri, date și hash-uri; director 0700 și fișiere 0600. Un export incomplet/corupt nu se importă, iar fișierele existente nu se suprascriu.

Conversia produce `database.sqlite`, `schema.sql`, `import.sql`, `verification.json`. Verifică toate rândurile prin cheia primară, FK-urile și integritatea, dimensiunea bazei și limitele declarațiilor/rândurilor D1. JSON și BIGINT sunt păstrate exact; numericile folosesc afinitatea NUMERIC SQLite (cotele fracționare pot fi reprezentate ca double, ca în calculele JS). Datele sunt UTC ISO cu șase zecimale; adaptorul de runtime va trebui să le decodeze în tipurile așteptate de aplicație (Date/boolean/JSON).

Singura schimbare de stare la conversie: lease-urile temporare Render sunt golite în `ticket_generation_jobs` și `automation_runs`. Nu se șterg analize, istorice, sesiuni, rezultate sau plafoane de consum.

**Limite care blochează importul:** tip/expresie necunoscută, FK rupt, hash sau număr de rânduri diferit, rând >2 MB, SQL >100 KB, bază >500 MB. Un checkpoint mare trebuie împărțit sau mutat în altă stocare înaintea migrării; nu este trunchiat. Nu putem declara baza reală compatibilă înainte să ruleze acest control pe snapshotul Neon.

Schema staging este deja creată. **Nu executa `import.sql` peste ea**: conține CREATE TABLE și date, pentru o țintă goală. Pentru importul final trebuie adaptat importerul să aplice doar date pe schema verificată sau folosită o bază nouă, după validarea egalității schemelor. Nu șterge staging/producția automat.

Fișierele private includ conturi și hash-uri de sesiune/coduri: nu se publică, nu se comit, nu se includ în capturile de ecran. `migration-private/`, `.dev.vars*`, `.open-next/`, `.wrangler/` sunt ignorate de Git.

## Lucrări necesare înainte de mutarea completă

Inventarul regenerabil este în `docs/cloudflare-readiness-2026-10-25.json`; este o căutare de indicii, **nu un parser SQL sau o estimare de timp**.

1. **Repository D1.** Conversie explicită a interogărilor din auth/conturi, catalog, assignments/usage, statistici/views, job service/pipeline, settlement și automation. Înlocuirea `pg.Pool`, `DISTINCT ON`, casturilor, operatorilor JSONB, ANY/array_agg, intervalelor și regex-urilor. Păstrarea contractelor Date/boolean/JSON/numeric ale apelanților. Nicio traducere SQL generică prin înlocuiri la runtime.
2. **Atomicitate.** Înlocuirea `tx`, advisory locks și `FOR UPDATE SKIP LOCKED` cu loturi D1 atomice și UPDATE condiționat cu lease/token. Teste cu cereri concurente pentru max. 20 bilete, batch request ID idempotent, o singură execuție per job, plafon global OpenRouter și drepturi de creator/admin.
3. **Workflows.** Granularitate per pas de cercetare/agent/rundă și finalizare, cu ID stabil per operație. Rezultatele deja persistate nu se recalculează la reluare; evenimentele și rezervările de buget trebuie deduplicate. Timeout-ul unui furnizor după facturare poate avea rezultat incert: nu promitem exact-once la API-ul extern. Rămân modelele, personajele, regulile de consens, limitele și 5 USD/zi existente.
4. **Programare rezultate.** Cron la 5 minute, procesare în loturi și lease D1, actualizare deterministă a rezultatelor și statisticilor chiar fără vizitatori. Nu generează bilete/analize AI noi fără cerere explicită. Salvarea `automation_runs` și verificarea întârzierilor. Fără intervale Node persistente.
5. **Live/replay.** Citire de evenimente după `seq`, numai câmpurile necesare pentru progres; backoff și oprire când tabul este ascuns. Nu se citește checkpointul complet la fiecare actualizare. Verificare cu două persoane care urmăresc aceeași analiză și reconectare/reluare.
6. **Autentificare.** Aceleași ID-uri/hash-uri/secrete, invitații și drepturi. OAuth callback rămâne `https://primul11.noventra.ro/auth/callback` după mutarea aceluiași domeniu. Staging are cookie/origine separate; nu se dă acces administrator prin Google. Secretele se configurează prin Wrangler secret, nu vars în Git.
7. **Limite Free.** Măsurare CPU per cerere/pas, subrequests, pași Workflow, citiri/scrieri și creșterea datelor; SSR nu este garantat sub limita de 10 ms. D1 Free are limite zilnice și poate refuza cereri la depășire. OpenRouter rămâne cu propriile costuri/limite. Nu activa automat un plan plătit sau R2/Images.

## Procedura de schimbare a producției

1. Restabilirea accesului Neon și export complet verificat; înainte de schimbare se păstrează și un backup PostgreSQL nativ pentru restaurare.
2. Aplicația D1 + Workflows trece toate testele în staging cu date autorizate; se verifică egalitatea rezultatelor/statisticilor per agent, istoricul incomplet, invitațiile, Google și generarea/reluarea cu furnizori simulați.
3. Validare controlată cu furnizori reali, în plafonul existent și numai pentru o analiză cerută explicit. Măsurare performanță și costuri Free.
4. Oprire temporară a scrierilor și workerului vechi, export final coerent, import într-o țintă verificată, comparație integrală și backup țintă. Nu porni simultan două schedulere pe aceleași joburi.
5. Abia apoi se configurează domeniul/custom route și se testează login/creare/reluare/settlement. Datele vechi nu sunt șterse.
6. Rollback simplu către Render/Neon este sigur **înainte de acceptarea scrierilor pe D1**. După scrieri noi trebuie reconciliate/exportate înapoi; simpla schimbare DNS ar pierde acele modificări. Dacă reconcilierea nu este pregătită, se opresc scrierile înainte de rollback.

## Referințe verificate

- https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- https://opennext.js.org/cloudflare/get-started
- https://developers.cloudflare.com/d1/best-practices/import-export-data/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workflows/reference/pricing/
