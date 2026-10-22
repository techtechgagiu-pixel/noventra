import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export default async function Legacy({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fresh?: string }> }) {
  const { id } = await params;
  redirect(`/?tab=istoric&ticket=${encodeURIComponent(id)}${(await searchParams).fresh === '1' ? '&fresh=1' : ''}`);
}
