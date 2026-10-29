import { config } from './config';
import { GUEST_CUSTOM_LIMIT, OWNER_CUSTOM_LIMIT } from './slots';

/** Only the accounts listed in TICKET_REMOVE_EMAILS may remove tickets (any ticket). Everyone else never sees the button. */
export const canRemoveTickets = (user: { email: string } | null | undefined) => !!user && config.ticketRemovers.includes(user.email.trim().toLowerCase());

/** The site owner's Google accounts (same list): may see who signed in with Google, read-only (owner request 28.10). */
export const canSeeAccounts = (user: { email: string; role?: string } | null | undefined) => !!user && (user.role === 'admin' || canRemoveTickets(user));

/** Custom tickets a user may create per day: 30 for the owner, 1 for everyone else (owner decisions 28.10), unless the
 * owner set a limit for that account (users.custom_daily_limit, e.g. 10 for a friend, 29.10). */
export const customLimitFor = (user: { email: string; role?: string; customDailyLimit?: number | null } | null | undefined) =>
  canSeeAccounts(user) ? OWNER_CUSTOM_LIMIT : user?.customDailyLimit != null ? Math.max(0, Math.min(OWNER_CUSTOM_LIMIT, user.customDailyLimit)) : GUEST_CUSTOM_LIMIT;
