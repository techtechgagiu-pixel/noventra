'use client';
import { Component, startTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

const CHUNK = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/**
 * 18.11: a tab whose server render fails once (a database read that times out, a busy Worker) is fetched again in place,
 * up to three times, instead of replacing the whole page with „Verific conexiunea TREI PUNCTE…”.
 */
class Boundary extends Component<{ children: ReactNode; refresh: () => void }, { error: Error | null; tries: number }> {
  state = { error: null as Error | null, tries: 0 };
  timer: ReturnType<typeof setTimeout> | undefined;
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    console.error(error);
    if (CHUNK.test(`${error?.name} ${error?.message}`)) { window.location.reload(); return; }
    if (this.state.tries >= 3) return;
    this.timer = setTimeout(() => {
      startTransition(() => { this.props.refresh(); this.setState((s) => ({ error: null, tries: s.tries + 1 })); });
    }, 400 + this.state.tries * 900);
  }
  componentWillUnmount() { clearTimeout(this.timer); }
  render() {
    if (!this.state.error) return this.props.children;
    const gaveUp = this.state.tries >= 3;
    return (
      <div role="status" className="mx-auto max-w-md py-16 text-center">
        <p className="text-lg font-semibold">{gaveUp ? 'Tabul nu s-a încărcat.' : 'Reîncarc tabul…'}</p>
        <p className="mt-2 text-sm text-muted">{gaveUp ? 'Datele nu au răspuns de trei ori la rând. Încearcă din nou peste câteva secunde.' : 'O citire din baza de date a durat prea mult. O cer din nou.'}</p>
        {gaveUp && <button type="button" className="btn btn-primary mt-4 px-4 py-2" onClick={() => startTransition(() => { this.props.refresh(); this.setState({ error: null, tries: 0 }); })}>Încarcă din nou</button>}
        {this.state.error && 'digest' in this.state.error && <p className="mt-3 text-[11px] text-muted">Cod: {String((this.state.error as Error & { digest?: string }).digest)}</p>}
      </div>
    );
  }
}

export function TabBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  return <Boundary refresh={() => router.refresh()}>{children}</Boundary>;
}
