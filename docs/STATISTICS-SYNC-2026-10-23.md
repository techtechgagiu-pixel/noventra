# Sincronizare pronosticuri, statistici și rezultate — 23 octombrie 2026

## Probleme constatate în producție

- Cardul lui Mircea Lucescu afișa cotă medie 1,22 și estimare 76%, în timp ce istoricul decis folosit în tabelul de performanță avea 1,18 și 79%. Cardul includea și pronosticuri neîncheiate în medii. Numărul de rezultate decise era același.
- Istoricul de pe card era limitat la 12 poziții, iar tabelul de performanță la 200 de rezultate; statisticile nu aveau aceeași limită. Rezultatele vechi nu puteau fi urmărite complet.
- Arhiva era comună, dar vechile totaluri de performanță erau personale și nu urmau filtrele arhivei. Lista API avea și o limită tăcută de 400 de bilete.
- În detaliul unei analize apărea votul echipei, fără rezultatul pronosticului propriu al agentului sau explicația unei poziții ulterioare.
- Actualizarea scorurilor începea abia la două ore după start. Catalogul Meciuri putea arăta un snapshot vechi chiar dacă scorul final fusese confirmat în baza de date.
- Resincronizarea nu repara toate rezultatele cache deja completate și nici agregatele biletelor ale căror selecții erau deja corecte.

## Reguli comune după corecție

1. Se păstrează ultima rundă per analiză/meci/agent, apoi ultima poziție per meci/agent în sfera selectată. Un NO_BET ulterior nu reactivează un pronostic vechi câștigător.
2. Luna este luna meciului în Europe/Bucharest; data analizei apare separat. Sfera comunitate/personal este explicită.
3. Rata, cota medie și probabilitatea medie folosesc numai WON/LOST. Pending, VOID și NO_BET au contoare separate.
4. Istoricul complet are filtre pe rezultat și paginare vizuală de opt poziții; nu mai este trunchiat la 12. În detaliul unui bilet se păstrează analiza sa istorică și se indică o poziție mai nouă în statisticile comunității.
5. Performanța biletelor este calculată din exact lista filtrată după creator, perioadă și stare. Rezultatele agentului și rezultatul întregului bilet sunt explicate distinct.
6. Aceeași funcție deterministă stabilește rezultatele pronosticurilor și selecțiilor din scoruri/fapte confirmate. Rezultatele diferite se corectează în loturi; agregatele tuturor biletelor complete sunt reverificate. Pronosticurile și cotele originale nu sunt înlocuite.
7. Scorurile pot fi actualizate din momentul începerii meciului, cu interval de cinci minute. Un scor live nu devine rezultat final doar din cauza timpului trecut. Snapshotul Meciuri nu retrogradează un rezultat final salvat.
8. Modelul afișat este atribuirea activă. Latența medie este ponderată cu apelurile reușite; costul lunar urmărește luna selectată. Costurile rămân estimări din tokeni/prețurile configurate, nu factura OpenRouter.
9. Contextul SCOUT din detaliul unui bilet este datat cu momentul salvării și identificat ca sinteză AI istorică. O mențiune veche despre scor în text nu înlocuiește scorul final confirmat al selecției.
10. În Meciuri, o selecție validată fără pronostic individual identic își recuperează denumirea din snapshotul acelei analize; nu afișează un câmp gol și nu împrumută o selecție de la alt meci.

## Verificări locale

- Build de producție și TypeScript: trecute.
- 106 teste unitare/de integrare: trecute.
- 11 teste Playwright end-to-end: trecute, pe PostgreSQL separat și furnizori AI simulați.
- Cazurile includ medii numai pe rezultate decise, peste 200 de rezultate, NO_BET ulterior, istoric complet/paginat, comunitate/personal, filtre de arhivă, rezultate live/finale, corectarea unui cache greșit, agregate învechite, sursă întârziată și actualizare vizibilă fără declanșare AI.
- Testul de expirare a invitației folosește 48 de ore exacte în fixture: două zile calendaristice pot dura 49 de ore la schimbarea orei. Logica de autentificare nu s-a schimbat.

## Publicare și revenire

Nu sunt necesare migrări noi sau schimbări de acces. Furnizorii, modelele, motorul de selecție și feedbackul său limitat la 80 de rezultate nu sunt modificate. Nu s-au pornit analize AI reale sau creat servicii plătite.

Versiune anterioară pentru revenire: `0af0c67adebbffde08d9b694d3338b5fe31fd2a9`, deploy `dep-dbd5ake7bikc73f5g4dg`. Reveniți dacă autentificarea, arhiva/statisticile eșuează repetat sau apar rezultate care contrazic scorul confirmat. Corecțiile de outcome sunt reproductibile din faptele salvate; istoricul brut și cotele nu sunt șterse.

Verificarea după deploy trebuie să compare API-urile de statistici/agenți, istoricul complet și toate biletele salvate, apoi să inspecteze paginile în browser. Datele private de audit și raportul live sunt păstrate în afara repository-ului.

## Limite reale

Render Free rulează verificările în proces: la pornire/trezire și la cinci minute cât procesul este activ. Nu există garanție de execuție continuă cât serviciul doarme. Analizele PAUSED nu sunt reluate de această verificare și nu primesc buget nou automat.

Un meci fără confirmare de la sursă rămâne în așteptare; nu se inventează scoruri. Faptele suplimentare lipsă pentru anumite piețe păstrează regulile existente de anulare. Lipsa unui pronostic valid sau un apel AI eșuat nu este transformată în NO_BET sau într-un rezultat câștigător.

## Corecție observată la verificarea live a catalogului

După completarea etichetelor, cererea Meciuri a depășit 60 de secunde, în timp ce statisticile și health răspundeau normal. Recuperarea etichetelor din JSON a fost mutată din proiecția SQL corelată într-o singură citire de snapshoturi pentru deciziile deja selectate. Încărcarea inițială a surselor este acum așteptată maximum 1,5 secunde per răspuns: pagina primește starea „se actualizează” și verifică din nou, iar descărcarea comună continuă în fundal. Această schimbare evită ținerea cererii HTTP deschise prin toate reîncercările ligilor. Testul suplimentar verifică răspunsul intermediar, deduplicarea și disponibilitatea ulterioară a datelor, fără AI.
