/**
 * Creates KaiWriter Pro Stripe test product + prices and prints Supabase secret commands.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npm run setup:stripe
 * Or add STRIPE_SECRET_KEY to .env.local and run:
 *   npm run setup:stripe
 */
import Stripe from 'stripe';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const PROJECT_REF = 'yexiewlzcuoosrijhqby';
const WEBHOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/stripe-webhook`;

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey?.startsWith('sk_test_') && !secretKey?.startsWith('sk_live_')) {
  console.error('\n❌ Missing STRIPE_SECRET_KEY in .env.local or environment.');
  console.error('   Get your test secret key from: https://dashboard.stripe.com/test/apikeys');
  console.error('   Add to .env.local: STRIPE_SECRET_KEY=sk_test_...\n');
  process.exit(1);
}

const stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' });

async function findOrCreateProduct() {
  const existing = await stripe.products.search({ query: "name:'KaiWriter Pro'" });
  if (existing.data[0]) return existing.data[0];
  return stripe.products.create({
    name: 'KaiWriter Pro',
    description: 'Unlimited documents, cloud sync, DOCX export, and all templates.',
    metadata: { app: 'kaiwriter' },
  });
}

async function findOrCreatePrice(productId, lookupKey, unitAmount, interval) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 20 });
  const match = prices.data.find((p) => p.lookup_key === lookupKey);
  if (match) return match;
  return stripe.prices.create({
    product: productId,
    currency: 'usd',
    unit_amount: unitAmount,
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    metadata: { app: 'kaiwriter' },
  });
}

async function findOrCreateWebhook() {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
  const existing = endpoints.data.find((e) => e.url === WEBHOOK_URL);
  if (existing) {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      return { ...existing, secret: process.env.STRIPE_WEBHOOK_SECRET };
    }
    console.warn('\n⚠ Webhook exists but secret unavailable — recreating endpoint for test mode...');
    await stripe.webhookEndpoints.del(existing.id);
  }
  return stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: [
      'checkout.session.completed',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ],
    description: 'KaiWriter Pro subscription webhook',
  });
}

async function main() {
  console.log('\n🔧 Setting up KaiWriter Stripe test mode...\n');

  const product = await findOrCreateProduct();
  console.log(`✓ Product: ${product.name} (${product.id})`);

  const monthly = await findOrCreatePrice(product.id, 'kaiwriter_pro_monthly', 999, 'month');
  const annual = await findOrCreatePrice(product.id, 'kaiwriter_pro_annual', 7900, 'year');
  console.log(`✓ Monthly price: ${monthly.id} ($9.99/mo)`);
  console.log(`✓ Annual price:  ${annual.id} ($79/yr)`);

  const webhook = await findOrCreateWebhook();
  console.log(`✓ Webhook endpoint: ${webhook.url}`);
  if (!webhook.secret) {
    console.error('❌ No webhook secret available. Add STRIPE_WEBHOOK_SECRET to .env.local and re-run.');
    process.exit(1);
  }

  const publishable = process.env.STRIPE_PUBLISHABLE_KEY ?? '(add pk_test_... to .env.local as STRIPE_PUBLISHABLE_KEY)';

  console.log('\n--- Add to .env.local (client) ---');
  console.log(`VITE_STRIPE_PUBLISHABLE_KEY=${publishable === '(add pk_test_... to .env.local as STRIPE_PUBLISHABLE_KEY)' ? 'pk_test_...' : publishable}`);

  console.log('\n--- Supabase Edge Function secrets ---');
  const secrets = [
    `STRIPE_SECRET_KEY=${secretKey}`,
    `STRIPE_PRICE_MONTHLY=${monthly.id}`,
    `STRIPE_PRICE_ANNUAL=${annual.id}`,
    `STRIPE_WEBHOOK_SECRET=${webhook.secret}`,
  ];

  for (const s of secrets) console.log(s);

  const shouldPush = process.argv.includes('--push-secrets');
  if (shouldPush) {
    console.log('\n⏳ Pushing secrets to Supabase...');
    execSync(
      `supabase secrets set ${secrets.map((s) => `"${s}"`).join(' ')} --project-ref ${PROJECT_REF}`,
      { stdio: 'inherit' },
    );
    console.log('✓ Secrets pushed to Supabase Edge Functions.\n');
  } else {
    console.log('\nRun with --push-secrets to push these to Supabase automatically:');
    console.log('  npm run setup:stripe -- --push-secrets\n');
  }

  console.log('Test checkout: sign in → Upgrade to Pro → use card 4242 4242 4242 4242\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
