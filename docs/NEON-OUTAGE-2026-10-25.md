# Incident de disponibilitate — 25 octombrie 2026

Ecran raportat: „Reconectez PRIMUL 11…”, digest **3513325323**. Jurnalele Render asociază digestul cu eroarea PostgreSQL „Your account or project has exceeded the quota”. Health live raportează `database: unavailable`, HTTP 503. Serviciul Render este activ pe plan Free; nu era doar o trezire din standby.

Confirmat în consola Neon și prin `describe_project` read-only:

- Proiect: **betmind-six**, `misty-rice-52788329`, organizația `org-gentle-surf-90076321`, branch production `br-wispy-art-b92hpeix`.
- Banner explicit: **You've used all of your monthly network transfer allowance for this project**.
- Transfer raportat: **6.003.107.937 bytes** (~6 GB); planul gratuit include 5 GB/proiect/lună.
- Calcul raportat ~20,11 CU-ore, stocare ~136,66 MB: acestea nu sunt limitele care au produs acest incident.
- Perioada: 19 octombrie–**1 noiembrie 2026 00:00 UTC**, adică **02:00 București** la reset.

Nu s-au schimbat planul, facturarea, DNS-ul sau baza de date și nu s-au șters date. În starea suspendată, nu se poate face o migrare normală prin citirea bazei existente. Optimizarea interogărilor reduce transferul viitor, dar nu resetează cota deja consumată. Fără un upgrade autorizat sau o intervenție/resetare a furnizorului, disponibilitatea depinde de noua perioadă. Nu s-a trimis niciun mesaj la suport în numele utilizatorului.

Consola afișează și un plan Build la **10 USD/lună**, cu 25 GB transfer inclus. Este doar o opțiune observată în cont; **nu a fost selectată sau cumpărată**. Detaliile din cont au prioritate față de recomandări generice despre prețuri.

Surse: [limitele Neon Free](https://neon.com/docs/introduction/plans), [FAQ oficial în repo-ul Neon](https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md).

## Separarea interfeței de procesarea AI

Propunere, **neimplementată**: interfață și fișiere statice pe Cloudflare; joburile AI pe Render; datele într-o bază cu cote suficiente. O prezentare statică poate rămâne disponibilă independent de procesarea AI. Istoricul, autentificarea și statisticile au nevoie și de date disponibile; simpla mutare a paginii nu elimină cota Neon.

Render Free adoarme după 15 minute fără trafic de intrare, iar un serviciu Render Background Worker dedicat nu are instanță Free. Cloudflare Workers Free are propriile limite (100.000 cereri/zi, 10 ms CPU/cerere). Nu se promite funcționare 24/7 a întregii aplicații pe planuri gratuite și nu se face o migrare de infrastructură în cadrul acestei intervenții.

Surse: [Render Free](https://render.com/docs/free), [tipuri de servicii Render](https://render.com/docs/your-first-deploy), [limite Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/).
