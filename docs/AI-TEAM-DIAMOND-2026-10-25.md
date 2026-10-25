# Echipa AI și Diamond Super — 25 octombrie 2026

## Agenți noi

32 de agenți de vot și două roluri editoriale (Corina și SCOUT). Cei zece agenți noi sunt identități originale, fără atribuirea unor opinii persoanelor reale:

| Agent | Model OpenRouter | Rol |
|---|---|---|
| Nova | minimax/minimax-m3.1-flash | Contrarian |
| Sigma | z-ai/glm-5.3 | Auditor statistic |
| Atlas | google/gemini-3.8-flash | Actualitate și știri |
| Argus | anthropic/claude-sonnet-5.5 | Criticul dovezilor |
| Orion | openai/gpt-6.1-sol | Auditorul regulilor |
| Prisma | qwen/qwen3.8-max-0902 | Interpreta piețelor |
| Mnemos | moonshotai/kimi-k3.1-pro | Memoria dezbaterii |
| Nexus | nvidia/nemotron-3-ultra-550b-a55b | Mediator |
| Vector | mistralai/mistral-large-4-0 | Analist de scenarii |
| Fulger | nvidia/nemotron-3.5-lightning | Inspector rapid |

Sunt disponibili individual, în presetul **Noua echipă AI (10)** și în **Toți** din Custom. Echipa implicită de cinci rămâne aceeași. Fiecare nou agent are propriile instrucțiuni, limite de risc, cotă maximă și probabilitate minimă. Atlas primește atât statisticile, cât și știrile indexate cu sursă și dată; Ștucan își păstrează rolul exclusiv de știri. Mircea Lucescu rămâne singurul creier al echipei. Nu se adaugă ponderi sau voturi speciale pentru modelele noi.

Noile analize standard/review salvează `config.votingAgentIds`. Analizele vechi fără această proprietate păstrează cei 22 de votanți originali. Custom continuă să folosească exact selecția salvată a utilizatorului. Pragul formulei existente este 3 pentru zece agenți și 9 pentru 32. Harta și reducerul de replay cunosc noile identități; pe hartă au două rânduri separate de portrete.

Migrarea **017_new_ai_team.sql** adaugă identitățile înaintea configurării modelelor și a cheilor străine pentru predicții. Nu rescrie agenții sau rezultatele existente. Modelele sunt atribuite prin mecanismul versionat existent, cu rezerva gratuită existentă; catalogul și prețurile verificate sunt în `new-ai-models-catalog-2026-10-25.json`. Pentru modelele care cer raționament obligatoriu se trimite cel mai mic efort acceptat și se exclude textul raționamentului; tokenii de raționament sunt în continuare facturați. Plafonul configurat de 5 USD/zi, limitele de tokeni/apeluri și concurența nu au fost mărite. Catalogul dovedește disponibilitatea declarată, nu rezultate sportive sau disponibilitate garantată la fiecare cerere.

## Carduri

**Diamond Super** este rangul de carieră pentru **strict peste 80%** rezultate verzi, cu minimum **15** rezultate decise. Exact 80% rămâne Super; rangul se poate schimba când vin rezultate sau corecții. Luna filtrează rezultatele afișate, în timp ce rangul folosește cariera din sfera selectată, ca înainte. Rezultatele în așteptare, anulate și NO BET nu cresc rangul. Rolurile editoriale rămân fără rang de vot.

Rama diamantată este desenată din fațete cristaline alb-argintii, inclusiv în vederea Personaje. Cardurile păstrează dimensiunile compacte și tipografia Inter / Space Grotesk. Paleta existentă: navy #0a1020, alb rece #eef4ff, slate #b6c1d5, mint #80e1c5; Diamond adaugă cristal #d6f5ff și reflexii lavandă #d5c6ff. Fațetele sunt statice: fără animații repetate sau modificarea lizibilității textului.

## Imagini

Zece portrete originale generate individual cu **instrumentul image_gen integrat**, fără CLI/API separat. Fișiere finale: `public/ai-portraits/{nova,sigma,atlas,argus,orion,prisma,mnemos,nexus,vector,fulger}-v1.webp`. Maximum 384 px, 339.774 bytes în total, lazy loading. Aceleași fișiere apar în Custom, hartă/chat și ambele vederi ale statisticilor. Optimizarea WebP nu schimbă compoziția; originalele PNG rămân în directorul Codex generated_images.

Prompturile exacte: [new-ai-portraits-prompts-2026-10-25.json](new-ai-portraits-prompts-2026-10-25.json). Sunt interpretări artistice neoficiale, fără logo-uri sau asemănări deliberate cu persoane reale.

## Consum de trafic și eroarea de reconectare

Două interogări transferă acum numai câmpurile folosite: statisticile nu mai primesc întregul payload cu argumentele fiecărui pronostic, iar `jobMeta` calculează pe serverul SQL patru contoare în loc să transfere întregul checkpoint la fiecare poll. Istoricul și calculul rezultatelor rămân complete.

Health distinge o cotă DB depășită prin codul public `databaseIssue: quota`, fără eroarea brută a furnizorului. Ecranul de recuperare oprește retry-ul automat în acel caz și nu mai afirmă nefondat că serverul pornește. Pagina principală poate arăta prezentarea publică și un mesaj de indisponibilitate când o sesiune existentă întâlnește cota DB. Autentificarea și operațiunile protejate nu sunt ocolite.

## Verificări și publicare

**182 teste unitare/de integrare trecute**, build de producție trecut. Testele includ toate zece modele prin pipeline cu furnizori falși, compatibilitatea cererilor JSON/raționament, rosterul istoric, știrile Atlas, limitele exacte Diamond, progresul fără checkpoint și health cu/fără cotă depășită. CUA local confirmă 34 de carduri, cele zece portrete, presetul cu exact zece selectați și rama diamantată. Datele locale sunt sintetice; nicio analiză AI de producție nu a fost pornită. Suita automată Playwright nu a fost rulată.

**Publicarea este blocată de cota de transfer Neon epuizată în producție.** Nu se pornește un deploy care ar eșua la migrarea de startup. Vezi [NEON-OUTAGE-2026-10-25.md](NEON-OUTAGE-2026-10-25.md). Implementarea și validarea locală nu reprezintă o restaurare a serviciului live.
