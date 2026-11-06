import { notFound } from 'next/navigation';
import { currentUser } from './auth';
import { canSeeAccounts } from './ticket-removal';
export async function requireAdminPage() {
  const u = await currentUser();
  if (!u || u.role !== 'admin') notFound();
  return u;
}

/** Same as requireAdminPage, but also lets the owner's own accounts in (the unified admin panel). */
export async function requireOwnerPage() {
  const u = await currentUser();
  if (!u || !canSeeAccounts(u)) notFound();
  return u;
}
