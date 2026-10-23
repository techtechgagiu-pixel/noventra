# Prima vizită și Custom

Brief: prima pagină trebuie să explice că personajele sunt agenți AI cu stiluri diferite, că argumentele sunt contestate și că numai selecțiile acceptate ajung pe bilet. Custom trebuie să fie accesibil imediat, fără costuri sau schimbări de infrastructură.

Plan vizual: păstrăm cerneala #060b18, panoul #0f1a35, textul #eef2fb, cyan #5ee7f7, violet #a78bfa și aur #e8c26a. Space Grotesk pentru titluri/decizii și Inter pentru explicații. Aliniere la stânga; pe desktop mesajul și acțiunea lângă masa dezbaterii, pe mobil acțiunea înaintea exemplului.

```
Logo / Acasă                           Conectare sau navigare
Biletul începe cu o dezbatere.   | Portrete / roluri AI
Ce fac agenții + Creează Custom  | Propunere / Contestație / Decizie
Procesul: cerere → dezbatere → consens → bilet
Agenți și modele / fragmente reale pentru utilizatori conectați
```

Revizie înainte de implementare: înlocuim sloganul abstract „Analizează. Dezbate. Decide.” cu scopul concret: biletul. Evităm harta mare în redare automată la încărcarea paginii și nu ascundem acțiunea sub ea. Un singur element expresiv: masa dezbaterii cu portrete și argumente, fără numere de performanță inventate. Pagina publică explică mecanismul, fără citate fabricate sau expunerea analizelor private. Pagina conectată poate arăta un fragment real din arhiva comună, cu data și acces la jurnal.

Custom: cota și numărul de meciuri rămân la vedere. Intervalul, ligile și alegerea completă a agenților sunt opțiuni extensibile; rezumatul setărilor și butonul de pornire sunt vizibile fără derulare prin 22 de carduri. Nicio analiză nu pornește la vizită, configurare sau previzualizare. Păstrăm politica de selecție, agenții impliciți, limitele și confirmarea explicită prin buton.

Optimizare: pagina publică fără interogări sau apeluri AI; prezentarea conectată transmite doar un fragment scurt, fără mii de evenimente și harta în redare automată. Sursa fragmentelor rămâne în arhiva accesibilă utilizatorilor conectați. Accesul Custom cerut înainte de logare se păstrează printr-o destinație fixă permisă, fără redirecționări arbitrare.

## Fragment public înregistrat

Prima vizită arată un fragment static, selectat din jurnalul real: Harrogate Town – Sutton United, 2026-10-23T11:01:21.114Z. Propunere Ianis, obiecție Ștucan, verdict Lucescu și acceptare 4/7. Textul propunerii este scurtat cu elipsă, fără rescriere; verdictul și obiecția sunt păstrate. Doar nume de personaje, argumente, piață și cota istorică; nu se publică date de cont, instrucțiuni personale sau identificatori de job. Modelele afișate în exemplul static provin din payload-urile înregistrate. Sursa de verificare locală (nepublică): /Users/cristiangagiu/Desktop/PRIMUL11-home-2026-10-23/recorded-example-source.json. Secvențe 686, 725, 750, 781. Exemplul este etichetat ca înregistrare, nu ofertă curentă.

Pe pagina conectată, un fragment recent din arhiva comună înlocuiește exemplul static atunci când este disponibil; numai acesta are legătură spre jurnalul complet.

## Verificări și livrare

Build de producție și TypeScript trecute. 119 teste unitare/de integrare, 14 teste E2E. Acoperire pentru prima vizită, pașii fragmentului real, conectare cu destinația Custom prin cod și prin starea Google semnată, refuzul destinațiilor arbitrare, păstrarea arhivei și a reluărilor, creare și verificare de bilete cu transport AI fals local, rezultate/carduri automate. Verificat că vizitarea și configurarea nu creează joburi sau apeluri AI și că API-ul catalogului se cere numai la deschiderea opțiunilor de ligi.

Revizie vizuală: desktop 1470 px și telefon 390×844. Acțiunea principală de pe home este vizibilă imediat. În Custom, după inspecție, cota și numărul de meciuri au fost puse alăturat pe mobil și media de cotă redusă la o bandă explicativă, pentru a ține butonul de pornire în primul ecran. Fără depășiri orizontale.

Publicare pe serviciul Render existent, plan Free, fără resurse noi, migrații sau schimbarea bugetelor și modelelor. Reversibil prin revenire la commitul e85e5f549bdffe1efcd6ba2acae2286124d81a0e dacă logarea, configurarea sau vizualizarea biletelor eșuează.
