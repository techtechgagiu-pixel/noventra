# Carduri compacte pentru agenți

Direcție: card de colecție fotbalistic, cu muchii teșite, un portret de aproximativ 80–90 px, nume centrat și detalii metalice în funcție de rang. Fără portrete dominante sau schimbarea navigării. Patru coloane pe desktop, două pe tabletă, una pe telefon; detaliile și istoricul se deschid la cerere.

Paletă: cerneală #0a1020, oțel #9ba9be, cupru #c78f68, aur #e5c477, ametist #aaa1f5, jad #80e1c5. Tipografie: Space Grotesk existent pentru nume/cifre și Inter pentru explicații. Textul verde/roșu și numerele identifică rezultatele și fără dependență exclusivă de culoare.

Revizie de design: evităm cardul generic de dashboard cu avatar minuscul, dar și afișul mare de jucător. Personalitatea vine din fața compactă de card, ramă și rang; fundalul paginii și controalele rămân discrete. Nicio animație continuă sau efect care ascunde datele.

## Calcul

- Nivelul/rangul folosesc rezultatele confirmate de la început în sfera selectată (comunitate sau personal). Schimbarea lunii nu resetează nivelul. Rezultatele și istoricul lunar rămân aceleași ca înainte.
- XP = max(0, 30 × verzi − 15 × roșii); nivel = 1 + floor(XP / 100). O corecție oficială de rezultat recalculează și nivelul. Pending, VOID, NO_BET și apelurile eșuate nu dau XP.
- Ranguri: Normal; Rafinat (minimum 5 decise, rată ≥ 50%); Unic (10, ≥ 60%); Elite (15, ≥ 70%); Super (15, ≥ 80%). Pragul Super a fost ajustat la cererea utilizatorului, pentru ca istoricul actual al primilor doi să îi plaseze la Super. Se acordă cel mai înalt rang ale cărui condiții sunt îndeplinite. Pragurile sunt vizibile în interfață.
- Corina și SCOUT au carduri editoriale, fără nivel, XP sau rezultate inventate.
- Acestea sunt indicatoare vizuale de istoric, fără modificarea modelelor, selecțiilor sau drepturilor. Nu sunt introduse recompense financiare, plăți sau beneficii pentru utilizatori.

## Verificare

Build de producție/TypeScript, 112 teste unitare/de integrare și 13 teste Playwright. Regresiile acoperă pragurile tuturor rangurilor, pierderea rangului la corecție, XP minim zero, rolurile editoriale, cariera independentă de lună și separarea comunitate/personal. Testul de interfață verifică patru coloane la 1200 px, lățime sub 300 px, portret de 75–100 px și lipsa depășirii orizontale la 390 px. Previzualizarea locală cu date salvate a fost inspectată vizual: 272×345 px/card și portret 86×90 px.

Actualizare automată: după actualizarea deterministă a rezultatelor (la pornire și aproximativ la cinci minute cât procesul este activ), pagina Statistici deschisă se reîmprospătează la circa 60 s. Testul browser simulează confirmarea unui rezultat și o corecție ulterioară: Unic/nivel 3 → Super/nivel 4 → Elite/nivel 3, fără reload manual sau apeluri AI. Render Free poate dormi.
