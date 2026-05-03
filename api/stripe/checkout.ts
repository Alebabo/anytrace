import Stripe from "stripe";
import { requireAuthenticatedUser } from "../_lib/auth.js";
import { env, requireEnv } from "../_lib/env.js";
import { readJsonBody, sendJson } from "../_lib/http.js";
import { getSiteUrlFromRequest } from "../_lib/supabase.js";

const stripe = new Stripe(requireEnv("stripeSecretKey"));

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }

  const auth = await requireAuthenticatedUser(req, res);
  if (!auth) return;

  try {
    const body = await readJsonBody(req);
    const siteUrl = getSiteUrlFromRequest(req);
    const successUrl = body.successUrl || `${siteUrl}/settings?checkout=success`;
    const cancelUrl = body.cancelUrl || `${siteUrl}/settings?checkout=canceled`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: auth.user.id,
      customer_email: auth.user.email ?? undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: auth.user.id,
      },
      subscription_data: {
        metadata: {
          userId: auth.user.id,
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            recurring: { interval: "month" },
            product_data: {
              name: "Anytrace Pro",
              description: "Unlimited graph, full signals, and unlimited watchlist access.",
            },
            unit_amount: env.stripeProPriceUsd * 100,
          },
        },
      ],
    });

    return sendJson(res, 200, {
      ok: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
