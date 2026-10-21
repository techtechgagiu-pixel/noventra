import Link from 'next/link';
export const metadata = { title: 'Confidențialitate · PRIMUL 11' };
/** Public privacy notice (required by Google sign-in). Plain, factual, matches what the app stores. */
export default function Privacy() {
  return <main className="mx-auto max-w-2xl space-y-5 px-5 py-12 text-sm leading-relaxed text-muted">
    <Link href="/login" className="text-cyan">← PRIMUL 11</Link>
    <h1 className="font-display text-3xl font-bold text-text">Politica de confidențialitate</h1>
    <p>PRIMUL 11 este o aplicație de analiză a meciurilor de fotbal cu agenți AI. Nu plasează pariuri și nu primește plăți.</p>
    <h2 className="font-display text-lg font-bold text-text">Ce date folosim</h2>
    <ul className="list-disc space-y-1 pl-5">
      <li>La conectarea cu Google: numele, adresa de e-mail și poza de profil ale contului Google (permisiunile „openid email profile”). Nu cerem acces la Gmail, Drive sau alte date.</li>
      <li>Biletele și analizele pe care le creezi, cu data creării.</li>
      <li>Un cookie de sesiune, ca să rămâi conectat (cel mult 14 zile), și tipul de browser folosit la conectare.</li>
    </ul>
    <h2 className="font-display text-lg font-bold text-text">Cine le vede</h2>
    <p>Biletele create apar pentru toți utilizatorii conectați, împreună cu numele și poza ta de profil; adresa de e-mail apare doar parțial (de ex. an•••@gmail.com). Administratorul vede lista conturilor conectate.</p>
    <p>Pentru analiză, datele despre meciuri (nu datele tale personale) sunt trimise furnizorilor de modele AI. Nu vindem și nu închiriem date.</p>
    <h2 className="font-display text-lg font-bold text-text">Păstrare și ștergere</h2>
    <p>Datele se păstrează cât timp aplicația funcționează. Poți cere ștergerea contului și a biletelor tale scriind la adresa de suport afișată în ecranul de conectare Google al aplicației.</p>
    <p className="text-xs">Actualizat: 21 octombrie 2026. 18+</p>
  </main>;
}
