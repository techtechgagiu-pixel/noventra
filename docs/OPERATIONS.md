# Operations — producție Cloudflare

## Găzduire și costuri

Site-ul și baza sunt pe Cloudflare Workers + D1, în planul activat de utilizator. Render existent rămâne Free pentru analize. OpenRouter își păstrează plafonul configurat; nu s-au cumpărat planuri sau chemat modele pentru validarea transferului. Nu se mai aplică vechea estimare „totul gratuit / 0 USD”. Consumul real depinde de trafic, scrieri și analize; urmărește contoarele contului, împărțite cu celelalte aplicații.

## Actualizări automate

Cloudflare Cron pornește `primul11-results` la 5 minute, chiar fără trafic. Fiecare execuție are maximum 30 pagini; `moreWork:true` înseamnă backlog preluat la următoarele execuții. Scorurile și piețele care nu pot fi confirmate rămân în așteptare. Cardurile folosesc aceleași rezultate validate. Cron nu generează bilete și nu cere inferențe AI; trezește Render dacă există joburi autorizate în coadă.

Render Free poate avea o întârziere la prima analiză după inactivitate; aceasta nu mai împiedică deschiderea site-ului. Pornirea noului proces și legătura reală D1 au fost verificate. Durata unei treziri după un interval complet de inactivitate nu a fost măsurată.

## Backup și revenire

Snapshotul final verificat și arhiva PostgreSQL sunt în directorul privat de backup de pe Desktop, în afara Git; exporturile includ date de cont și nu se distribuie. Pentru datele live folosește export D1 într-un fișier privat și verifică-l înainte de o migrare nouă. Păstrează și funcțiile de recuperare oferite de platformă.

Pentru rollback de cod păstrează D1 ca sursă de adevăr. Nu reatașa Neon fără transferul și verificarea tuturor scrierilor D1 noi. Configurația veche DNS este salvată privat, iar celelalte domenii ale contului nu au fost modificate.

## Retention
Ticket evidence (events, predictions, dossiers, decisions, snapshots) is permanent. `sessions` are purged when expired.
`model_usage_logs` and `provider_usage` can be trimmed after 90 days without affecting tickets.
