import Stripe from "stripe";
import { requireEnv } from "../_lib/env";
import { readRawBody, sendJson } from "../_lib/http";
import { setUserProState, supabaseAdmin } from "../_lib/supabase";

const stripe = new Stripe(requireEnv("stripeSecretKey"));

async function upsertSubscription(input: {
  userId: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  status: "trialing" | "active" | "past_due" | "canceled";
}) {
  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: input.userId,
      status: input.status,
      stripe_customer_id: input.customerId ?? null,
      stripe_subscription_id: input.subscriptionId ?? null,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

async function resolveUserIdFromSubscription(subscription: Stripe.Subscription) {
  const metadataUserId = subscription.metadata?.userId;
  if (metadataUserId) return metadataUserId;

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (error) throw error;
  return data?.user_id ?? null;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }

  try {
    const signature = req.headers["stripe-signature"];
    if (!signature || Array.isArray(signature)) {
      return sendJson(res, 400, { ok: false, error: "Missing Stripe signature." });
    }

    const rawBody = await readRawBody(req);
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      requireEnv("stripeWebhookSecret"),
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId ?? session.client_reference_id;

      if (userId) {
        await upsertSubscription({
          userId,
          customerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
          subscriptionId:
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id,
          status: "active",
        });
        await setUserProState(userId, true);
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = await resolveUserIdFromSubscription(subscription);
      if (userId) {
        const status =
          subscription.status === "active" || subscription.status === "trialing"
            ? (subscription.status as "active" | "trialing")
            : subscription.status === "past_due"
              ? "past_due"
              : "canceled";

        await upsertSubscription({
          userId,
          customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id,
          subscriptionId: subscription.id,
          status,
        });

        await setUserProState(userId, status === "active" || status === "trialing");
      }
    }

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
