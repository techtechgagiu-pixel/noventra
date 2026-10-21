import { many } from './db';

/** Google accounts (not invitation or owner identities), most recent sign-in first. */
const LIST = `SELECT u.id, u.name, u.email, u.picture, u.created_at, u.last_login_at, u.blocked_at,
                     (SELECT count(*) FROM tickets t WHERE t.user_id=u.id)::int AS tickets
              FROM users u WHERE u.google_sub NOT LIKE 'invite:%' AND u.google_sub <> 'owner:primary'
              ORDER BY u.last_login_at DESC NULLS LAST LIMIT 300`;
export const accountsList = () => many(LIST);
