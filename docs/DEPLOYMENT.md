# Deployment (Render Free + Neon Free)

## Resources
- Neon project `betmind-six` (AWS eu-central-1 Frankfurt), database `neondb`, role `neondb_owner`.
- Render web service `betmind-nexus`, plan **free**, region **frankfurt**, repo `techtechgagiu-pixel/noventra`, branch `betmind-six`.
- Build: `npm ci --include=dev && npm run build` · Start: `npm start` (runs migrations, then the standalone server) · Health: `/api/health`.

## Environment variables (Render → Environment)
See `.env.example`. Required: `DATABASE_URL`, `DIRECT_DATABASE_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `APP_BASE_URL`, `ADMIN_EMAILS`. Never commit values.

## Google OAuth
Google Cloud project `betmind-six-noventra`, existing Web client. Authorized redirect URIs to add:
- `https://<service>.onrender.com/auth/callback` (staging)
- `https://nexus.noventra.ro/auth/callback` (production)
Scopes: `openid email profile` only. While the consent screen is in *Testing*, only listed test users can sign in.

## Custom domain
1. Render → service → Settings → Custom Domains → add `nexus.noventra.ro`.
2. Cloudflare DNS (zone `noventra.ro`): `CNAME nexus → <service>.onrender.com`, **DNS only** (grey cloud) so Render can issue the certificate.
3. Set `APP_BASE_URL=https://nexus.noventra.ro`, redeploy, verify `/api/health` and Google login.
`betmindsix.noventra.ro` (Cloudflare Worker) is not touched.
