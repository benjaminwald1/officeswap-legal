// POST /api/checkout — starts a Stripe Checkout for a new organization:
// the chosen plan, a 30-day free trial, and a card collected up front.
// With { ui: "elements" } the card form appears on officeswap.co itself
// (Checkout Sessions with Stripe Elements) and this returns its client
// secret; otherwise it returns a link to Stripe's hosted page (cards only).
// The organization's details ride along on the subscription and are used
// to create it once Stripe confirms (see org.js). The admin code arrives
// already hashed by the browser; the code itself never leaves the page.

import { CHECKOUT_API_VERSION, PLANS, SITE, TRIAL_DAYS, json, missing, priceFor, stripe } from "../_lib/billing.js";

const b64 = /^[A-Za-z0-9+/]{16,100}={0,2}$/;

export async function onRequestPost({ request, env }) {
  if (missing(env, ["STRIPE_SECRET_KEY"]).length) return json({ error: "Sign-up isn't open yet. Please try again soon." }, 503);

  let b;
  try { b = await request.json(); } catch { return json({ error: "Something went wrong. Please try again." }, 400); }
  const s = (v, max) => (typeof v === "string" ? v.trim() : "").slice(0, max);
  const plan = s(b.plan, 20);
  const name = s(b.name, 100);
  const street = s(b.street, 120), city = s(b.city, 80), state = s(b.state, 40), zip = s(b.zip, 10);
  const email = s(b.email, 254);
  const masterHash = s(b.masterHash, 100), masterSalt = s(b.masterSalt, 100);

  if (!PLANS[plan]) return json({ error: "Choose a plan." }, 400);
  if (!priceFor(env, plan)) return json({ error: `The ${PLANS[plan].name} plan isn't open for sign-up yet. Please choose another plan or try again soon.` }, 503);
  if (!name) return json({ error: "Enter your organization's name." }, 400);
  if (!street || !city || !state || !/^\d{5}(-\d{4})?$/.test(zip)) return json({ error: "Enter the full office address, with a 5-digit ZIP code." }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (!b64.test(masterHash) || !b64.test(masterSalt)) return json({ error: "Choose an admin code." }, 400);

  const onPage = b.ui === "elements";
  const done = `${SITE}/start/done/?session_id={CHECKOUT_SESSION_ID}`;
  const params = {
    mode: "subscription",
    line_items: { 0: { price: priceFor(env, plan), quantity: 1 } },
    customer_email: email,
    payment_method_collection: "always",
    allow_promotion_codes: "true",
    billing_address_collection: "auto",
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      description: `OfficeSwap ${PLANS[plan].name} for ${name}`,
      metadata: { plan, org_name: name, street, city, state, zip, owner_email: email, master_hash: masterHash, master_salt: masterSalt },
    },
  };
  try {
    if (onPage) {
      // On this API version the payment methods offered are the ones turned on
      // in Stripe's dashboard (Settings > Payment methods).
      const session = await stripe(env, "POST", "checkout/sessions",
        { ...params, ui_mode: "elements", return_url: done }, CHECKOUT_API_VERSION);
      return json({ clientSecret: session.client_secret });
    }
    const session = await stripe(env, "POST", "checkout/sessions",
      { ...params, payment_method_types: { 0: "card" }, success_url: done, cancel_url: `${SITE}/start/?plan=${plan}` });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: "Checkout couldn't start. Please try again in a moment." }, 503);
  }
}
