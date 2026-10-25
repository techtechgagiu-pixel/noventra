import Link from 'next/link';
import { ArrowUpRight, MessagesSquare, SlidersHorizontal, Ticket, Vote } from 'lucide-react';
import { DebatePreview } from './debate-preview';
import { HOME_EXAMPLE, HOME_EXAMPLE_MODELS } from '@/lib/home-example';
import type { Thread } from '@/lib/home-reel';

export function HomeIntro({ signedIn = false, thread, models }: { signedIn?: boolean; thread?: Thread; models?: Record<string, string> }) {
  return <section className="home-intro" aria-labelledby="home-title">
    <div className="home-intro-copy">
      <div className="home-product-mark"><img src="/logo.svg" alt="" width={30} height={30} /><span>Fotbal analizat de o echipă de modele AI</span></div>
      <h1 id="home-title">Biletul tău începe cu o dezbatere.</h1>
      <p className="home-intro-lead">Modelele AI lucrează ca o echipă de analiști cu stiluri diferite. Citesc datele și știrile, se contrazic și își apără pronosticurile. Selecțiile susținute de echipă ajung pe bilet.</p>
      <div className="home-intro-actions"><Link href={signedIn ? '/?tab=custom' : '/login?next=custom'} className="btn btn-primary px-5 py-3.5"><Ticket size={19} aria-hidden />Creează bilet custom<ArrowUpRight size={17} aria-hidden /></Link><Link href={signedIn ? '/?tab=istoric' : '#cum-functioneaza'} className="home-secondary-link">{signedIn ? 'Vezi biletele create' : 'Cum funcționează'}</Link></div>
      <p className="home-intro-note">Alegi cota și numărul de meciuri. Poți schimba echipa, ligile și intervalul.{!signedIn && ' Te conectezi înainte de a porni analiza.'}</p>
    </div>
    <DebatePreview thread={thread ?? HOME_EXAMPLE} models={thread ? models : HOME_EXAMPLE_MODELS} />
  </section>;
}

export function HowItWorks() {
  const steps = [
    { icon: SlidersHorizontal, title: 'Tu dai direcția', text: 'Alegi cota dorită, numărul de meciuri și echipa de agenți.' },
    { icon: MessagesSquare, title: 'Ei pun argumentele pe masă', text: 'Compară datele, citesc știrile și își contestă concluziile. Urmărești discuția pe hartă și în chat.' },
    { icon: Vote, title: 'Votul filtrează selecțiile', text: 'Este nevoie de susținere suficientă. Modelul coordonator dă verdictul final; un meci poate fi refuzat.' },
    { icon: Ticket, title: 'Primești biletul explicat', text: 'Vezi selecțiile și cotele. După meciuri, rezultatele se reflectă în istoricul și cardurile agenților.' },
  ];
  return <section id="cum-functioneaza" className="home-process" aria-labelledby="home-process-title"><div className="home-section-heading"><h2 id="home-process-title">De la prima idee la bilet.</h2><p>Nu trebuie să fii de acord cu primul agent. Nici ceilalți nu sunt.</p></div><ol>{steps.map(({ icon: Icon, title, text }, i) => <li key={title}><span className="home-process-number">{i + 1}</span><Icon size={21} aria-hidden /><h3>{title}</h3><p>{text}</p></li>)}</ol></section>;
}
