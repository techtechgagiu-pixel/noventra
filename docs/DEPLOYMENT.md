# Deployment — Cloudflare Workers + D1, runner Render Free

## Resurse live

- Site: `https://primul11.noventra.ro`, Worker `primul11-app`, OpenNext.
- Bază: D1 `primul11-production-20261026`, EU, ID `8ec1fe52-2f39-46d4-9c8b-22271a5c3d4a`.
- Analize lungi: Render `betmind-nexus`, Free, Frankfurt, branch `betmind-six`. Build `npm ci --include=dev && npm run build`; start `npm start`.
- Rezultate: Workflow `primul11-results`, declanșare Cloudflare `*/5 * * * *` independent de vizitatori.
- [Dovezi de cutover](cloudflare-production.json), [procedură și recuperare](CLOUDFLARE-MIGRATION.md).

## Publicare

```sh
npm ci --include=dev
npm run cf:build:production
npm run cf:deploy
```

`cf:deploy` cere un receipt complet de cutover. Acesta documentează verificările efectuate, nu înlocuiește testarea unei versiuni noi. Migrările D1 noi se aplică explicit înaintea codului care le cere, cu backup și verificare. Nu reimporta snapshotul final peste producția populată. Nu publica `wrangler.validation.jsonc` sau baza de migrare pe domeniul real.

Render poate reconstrui codul la schimbarea branch-ului; păstrează `BETMIND_DATABASE=d1-http`, `BETMIND_RUNNER_ONLY=1`, `BETMIND_MAINTENANCE=0`, `BETMIND_DISABLE_WORKER=0` și bridge-ul. Health trebuie să arate `databaseBackend:d1-http`, `database:ok`. URL-ul direct Render servește numai health; gazda principală poate folosi temporar fallback-ul D1 în timpul propagării DNS. Nu porni din nou PostgreSQL ca bază activă.

## Secrete

Valorile se păstrează exclusiv în configurările serverelor, fără Git sau browser. Cloudflare: secretul de autentificare, hash-ul codului administrator, Google OAuth, configurările furnizorilor, `D1_BRIDGE_SECRET`, `ANALYSIS_RUNNER_URL=https://betmind-nexus.onrender.com`, `APP_BASE_URL=https://primul11.noventra.ro`, callback-ul `/auth/callback`. Nicio credențială PostgreSQL în Worker. Render primește numai URL-ul bridge și secretul său pentru D1; URL-urile Neon rămase sunt inactive și servesc recuperării.

Google folosește `openid email profile`, sesiuni obișnuite, niciodată administrator implicit. Codul administratorului nu expiră; invitațiile au 168 de ore de la emitere. Nu modifica hash-ul administratorului la publicare.

## Protecția transferului

Mentenanța se poate reactiva prin `BETMIND_MAINTENANCE=1` pe ambele runtime-uri; oprește și Cron/runnerul înaintea unui export coerent. Nu posta cheia temporară de verificare. După prima scriere nouă în D1, un rollback al DNS către Neon ar pierde datele noi: păstrează D1 și revino doar cu codul sau reconciliază explicit toate scrierile înaintea schimbării bazei.
