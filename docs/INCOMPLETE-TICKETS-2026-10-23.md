# Selecții vizibile pentru bilete incomplete

Cauză: optimizatorul păstrează numai combinația COMPLETED în ticket_selections. Un bilet INCOMPLETE are zero selecții finale, chiar dacă final_decisions conține candidați QUALIFIED. Arhiva citea numai ticket_selections, iar detaliul afișa doar explicația și combinația closest, fără rezultate pe candidat.

Remediere: proiecție read-only separată, partialSelections, din final_decisions QUALIFIED + piața/cota validate salvate + snapshot-ul analizei + scorurile/faptele actuale ale meciului. O singură interogare în lot pentru arhivă; aceeași funcție pentru detaliu. Astfel sunt afișate și biletele istorice, fără backfill sau o nouă analiză AI. Candidații REJECTED, NO_CONSENSUS și NO_BET nu sunt promovați în listă.

Interfață: arhiva afișează numărul selecțiilor acceptate și meciurile/pariurile/cotele, cu verzi/roșii/pending/void. Detaliul păstrează eticheta Incomplet, motivul, combinația closest extensibilă și lista tuturor meciurilor validate cu rezultate. Cota totală și numărul selecțiilor finale ale biletului nu sunt inventate. Selecțiile parțiale nu sunt introduse în tabelele cu selecții finale și nu schimbă randamentul ori rezultatul biletelor. Interfața explică separarea.

Rezultate: este reutilizată exact funcția de rezolvare a selecțiilor obișnuite, din fapte finale confirmate. Scorurile live rămân pending. Schedulerul include candidații biletelor incomplete chiar dacă nu au agent_predictions/ticket_selections asociate. Include reprize/cornere când sunt necesare; nu repetă cererile pentru fapte expirate după 72h sau amânări de peste 48h deja anulate. Actualizarea vizibilă folosește mecanismul de refresh existent. Render Free poate dormi, neschimbat.

Reproducere live înainte de fix: biletul Custom cu ținta 50 din 23 octombrie, 16:15 avea 21 decizii QUALIFIED și 30 snapshot-uri, dar zero selecții în arhivă. Combinația closest avea cota 34.07 din 13 meciuri.

Verificare: build de producție/TypeScript, 122 teste unitare/de integrare și suita E2E (15 teste). Regresii: recuperare istorică în arhivă/detaliu, excluderea respingerilor, verde/roșu/pending/void, corecție de scor, nicio promovare sau scriere în selecțiile finale, statistici finale păstrate, actualizare automată fără predicții asociate, expirarea faptelor lipsă și a amânărilor. Testul browser verifică listarea și actualizarea pe pagina deschisă, fără joburi sau apeluri AI noi.

Fără migrații, infrastructură nouă, schimbarea modelelor sau a algoritmului de optimizare. Rollback: commitul 7fb019feeff248c858710bbd90940ba638b713aa, dacă arhiva/detaliul sau actualizarea rezultatelor eșuează.
