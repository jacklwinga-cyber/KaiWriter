import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return new Response("Webhook secrets not configured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id ?? session.client_reference_id;
    if (userId) {
      let status = "active";
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        status = sub.status;
      }
      const isPro = status === "active" || status === "trialing";

      await admin.from("kaiwriter_subscriptions").upsert({
        user_id: userId,
        stripe_customer_id: session.customer as string | null,
        stripe_subscription_id: session.subscription as string | null,
        plan: isPro ? "pro" : "free",
        status,
        updated_at: new Date().toISOString(),
      });

      await admin.auth.admin.updateUserById(userId, {
        app_metadata: { kaiwriter_plan: isPro ? "pro" : "free" },
      });
    }
  }

  if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;
    const { data: row } = await admin
      .from("kaiwriter_subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    if (row?.user_id) {
      const isActive = subscription.status === "active" || subscription.status === "trialing";
      await admin.from("kaiwriter_subscriptions").update({
        status: subscription.status,
        plan: isActive ? "pro" : "free",
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("user_id", row.user_id);

      await admin.auth.admin.updateUserById(row.user_id, {
        app_metadata: { kaiwriter_plan: isActive ? "pro" : "free" },
      });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
