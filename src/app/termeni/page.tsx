import Link from 'next/link';
export const metadata = { title: 'Termeni · PRIMUL 11' };
export default function Terms() {
  return <main className="mx-auto max-w-2xl space-y-5 px-5 py-12 text-sm leading-relaxed text-muted">
    <Link href="/login" className="text-cyan">← PRIMUL 11</Link>
    <h1 className="font-display text-3xl font-bold text-text">Termeni de utilizare</h1>
    <ul className="list-disc space-y-2 pl-5">
      <li>Aplicația este destinată persoanelor de peste 18 ani.</li>
      <li>Analizele și biletele sunt generate automat de modele AI pe baza datelor publice și nu garantează niciun rezultat. Nu sunt sfaturi financiare și nu plasăm pariuri.</li>
      <li>Biletele pe care le creezi sunt vizibile pentru toți utilizatorii conectați, cu numele tău.</li>
      <li>Administratorul poate bloca un cont care folosește abuziv aplicația (de exemplu consum excesiv).</li>
      <li>Joacă responsabil.</li>
    </ul>
    <p>Vezi și <Link href="/confidentialitate" className="text-cyan">politica de confidențialitate</Link>.</p>
  </main>;
}
