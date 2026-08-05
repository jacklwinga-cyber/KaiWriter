#!/usr/bin/env node
/**
 * Prints DNS, Vercel, and Supabase settings for kaiwriter.kainoter.com
 * Run: npm run deploy:checklist
 */

const WRITER = 'https://kaiwriter.kainoter.com';
const HUB = 'https://hub.kainoter.com';

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  KaiWriter production checklist (Vercel project: kaiwriter)        ║
╚══════════════════════════════════════════════════════════════════╝

Your Vercel layout (already configured):
  • kaiwriter project  → ${WRITER}  ✓
  • kainoter project   → ${HUB}     (separate KaiHub app)
  • kainews project    → www.kainoter.com

1. VERCEL ENV (Production) — set in Project → Settings → Environment Variables
   VITE_SITE_URL=${WRITER}
   VITE_KAIWRITER_URL=${WRITER}
   VITE_KAIHUB_URL=${HUB}
   VITE_SUPABASE_URL=<your-project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-key>
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_... or pk_live_...

   After changing env vars: redeploy production (Deployments → Redeploy).

2. SUPABASE → Authentication → URL Configuration
   Site URL: ${WRITER}
   Redirect URLs:
   • ${WRITER}/app
   • ${WRITER}/
   • ${WRITER}/doc/**
   • http://localhost:5173/app
   • http://localhost:5173/
   • http://localhost:5173/doc/**

3. STRIPE CHECKOUT return URLs (via Edge Function)
   Success: ${WRITER}/app?checkout=success
   Cancel:  ${WRITER}/app?checkout=cancel

4. KAIHUB LINKS (this repo)
   Dashboard / landing → "KaiHub" opens ${HUB}
   Local KaiHub preview: http://localhost:5173/hub

Verify:
   curl -I ${WRITER}
   Open ${WRITER}/app → sign in → create document
`);
