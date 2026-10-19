import Link from 'next/link';
export default function NotFound() { return <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"><h1 className="font-display text-4xl font-bold">404</h1><p className="text-muted">Pagina nu există sau nu îți aparține.</p><Link href="/dashboard" className="btn btn-primary px-5 py-3">Acasă</Link></main>; }
