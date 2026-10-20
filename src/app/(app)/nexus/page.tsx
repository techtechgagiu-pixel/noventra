import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export default async function Legacy({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const { job } = await searchParams;
  redirect(job ? `/?tab=analiza&job=${encodeURIComponent(job)}` : '/?tab=analiza');
}
