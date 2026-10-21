# Primul11 — rezumat pentru Claude, 21 octombrie 2026

## Cererea utilizatorului

Acces fără cont sau Google: un cod permanent de administrator pentru proprietar și coduri individuale
de vizitator valabile 7 zile de la emitere. Vizitatorii au propriile bilete și pot porni analize.
Utilizatorul a cerut și acest rezumat pentru coordonarea proiectului cu Claude.

## Implementare

- `src/lib/auth.ts`: autentificare prin cod; `OWNER_ACCESS_CODE_HASH` pentru administrator;
  coduri de vizitator aleatoare (128 biți), stocate numai ca SHA-256. Sesiuni aleatoare în cookie
  HttpOnly, Secure în producție, SameSite=Lax. Proprietarul reutilizează identitatea existentă și biletele sale.
- `src/lib/http.ts`, `src/app/page.tsx`: eliminat accesul anonim ca proprietar/admin.
  API-urile private răspund 401, pagina principală redirecționează spre `/login`.
- `migrations/011_invitation_access.sql`: tabel `invitation_codes`, referință invitație și amprentă
  cod admin în `sessions`. Migrare aditivă; fără ștergeri sau mutări ale biletelor existente.
- `/auth/invite`: autentificare prin formular, protecție de origine și limitarea încercărilor.
  Google și callback-ul vechi redirecționează spre `/login`, fără emiterea vreunei sesiuni.
- `/admin/invitations`, `src/components/invitation-manager.tsx`: generare 1–20 coduri, afișate o singură dată;
  listă cu etichete, expirare, utilizare și revocare. API-urile de invitații cer rol admin.
- Vizitatori: identitate internă separată pentru fiecare cod, fără înregistrare sau e-mail real;
  rol user, bilete izolate. Statisticile de consum sunt limitate la propriile analize; admin vede consumul global.
- Expirarea și revocarea se verifică la fiecare cerere și în bucla SSE. Autentificarea repetată
  nu prelungește termenul; cookie-ul vizitatorului nu depășește expirarea invitației.
- Expirarea folosește `interval '168 hours'`, astfel încât schimbarea orei de vară/iarnă să nu adauge
  o oră. Codul admin nu expiră; sesiunea sa de browser durează maximum 14 zile și poate fi reînnoită cu același cod.
- Rotirea `OWNER_ACCESS_CODE_HASH` invalidează sesiunile admin anterioare.
- `render.yaml` și `.env.example`: domeniu actualizat și cheie pentru amprenta codului admin.
  Valorile se configurează separat în Render; nu publica niciodată coduri sau chei în Git.

## Verificări și operare

- Teste de integrare cu PostgreSQL real: anonimi, roluri, păstrarea identității proprietarului,
  emiterea a 5 coduri unice, expirare exactă, refuz după expirare, revocarea sesiunilor,
  rotirea codului admin, blocarea sesiunilor vechi și protecția de origine.
- Test browser pentru login admin, emitere, login vizitator, izolarea arhivei și revocare.
- Comenzi: `npm run typecheck`, `npm test`, `npm run build`;
  `PW_CHROMIUM='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npx playwright test tests/e2e/invitation-access.spec.ts`.
- Migrațiile pornesc din `scripts/start.mjs`. Pentru rollback, păstrează migrarea aditivă și publică
  o versiune cu autentificarea funcțională; revenirea la versiunea anterioară fără login ar redeschide accesul public.
- Codurile inițiale sunt livrate proprietarului într-un fișier local privat, în afara repository-ului.
  Nu cere și nu copia acel fișier în commituri, loguri sau conversații publice.

## Observații din analiză, în afara acestei modificări

- Lanț confirmat: Cloudflare DNS → Render `betmind-nexus` → repository `techtechgagiu-pixel/noventra`, ramura `betmind-six`.
- OpenRouter este integrat efectiv; Groq și Gemini există și ca rezerve. În pagina OpenRouter consultată
  apăreau 1,14 USD / 913 cereri pentru intervalul afișat, iar aplicația estima 1,25 USD și număra 2.010
  încercări cumulate la toate cele trei servicii. Contoarele nu au aceeași definiție.
- Plafonul OpenRouter este estimat din tokeni/prețuri și are cache de 20 secunde, fără rezervare atomică
  înainte de apeluri. Nu reprezintă un plafon financiar strict; nu a fost modificat în acest patch.
- `fallback` din statistici compară modelul rezolvat cu cel cerut, nu trecerea la furnizor/model de rezervă;
  merită corectat separat. Eșantioanele de rezultate sunt mici; rata de reușită nu demonstrează profitabilitate.
- Render este pe plan Free, cu worker în același proces; procesează numai cât serviciul este treaz.
  În configurația live consultată, `healthCheckPath` era gol, deși Blueprint declară `/api/health`.
- Nu s-au schimbat modelele, selecțiile, motorul de pronostic, DNS-ul sau planurile de plată.
- Nu s-a implementat automatizare sau reproducere a biletelor în Superbet.
