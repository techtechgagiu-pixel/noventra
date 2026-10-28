import { config } from './config';

/** Only the accounts listed in TICKET_REMOVE_EMAILS may remove tickets (any ticket). Everyone else never sees the button. */
export const canRemoveTickets = (user: { email: string } | null | undefined) => !!user && config.ticketRemovers.includes(user.email.trim().toLowerCase());
