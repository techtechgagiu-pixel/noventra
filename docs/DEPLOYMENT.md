# Deployment (Render Free + Neon Free)

## Resources
- Neon project `betmind-six` (AWS eu-central-1 Frankfurt), database `neondb`, role `neondb_owner`.
- Render web service `betmind-nexus`, plan **free**, region **frankfurt**, repo `techtechgagiu-pixel/noventra`, branch `betmind-six`.
- Build: `npm ci --include=dev && npm run build` · Start: `npm start` (runs migrations, then the standalone server) · Health: `/api/health`.

## Environment variables (Render → Environment)
See `.env.example`. Required for access: `DATABASE_URL`, `DIRECT_DATABASE_URL`, `OWNER_ACCESS_CODE_HASH`,
`APP_BASE_URL`. Preserve `OWNER_EMAIL` / `ADMIN_EMAILS` to reuse the existing owner identity. AI provider keys
remain server-side. Google credentials are no longer used for login. Never commit secret values.

## Invitation access
Set `OWNER_ACCESS_CODE_HASH` through Render's secret environment settings. Use a cryptographically random code;
normalize to uppercase without spaces/hyphens before SHA-256. The admin code does not expire; its browser
sessions last up to 14 days. Visitor codes expire exactly 168 hours after issue, including existing sessions.
Migration `011_invitation_access.sql` is additive and runs automatically at startup. `/admin/invitations`
displays newly generated visitor codes once, lists expiry dates and supports revocation.

## Custom domain
1. Render → service → Settings → Custom Domains → add `primul11.noventra.ro`.
2. Cloudflare DNS (zone `noventra.ro`): existing `CNAME primul11 → betmind-nexus.onrender.com`. Preserve its current configuration.
3. Set `APP_BASE_URL=https://primul11.noventra.ro`, redeploy, verify `/api/health`, anonymous API responses (401), admin login, visitor login and expiry/revocation.
`betmindsix.noventra.ro` (Cloudflare Worker) is not touched.
