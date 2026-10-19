import { notFound } from 'next/navigation';
import { currentUser } from './auth';
export async function requireAdminPage() {
  const u = await currentUser();
  if (!u || u.role !== 'admin') notFound();
  return u;
}
