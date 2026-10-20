import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
/** Kept only so old links keep working: everything lives on the single page now. */
export default async function Legacy() {
  redirect('/?tab=istoric');
}
