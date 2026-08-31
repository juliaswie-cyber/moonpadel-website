// Stripe calls this URL automatically whenever a checkout session completes.
// It marks the matching cart record as "recovered" so the reminder function
// knows NOT to email this person — they already bought.
//
// Setup required (see ADD-ONS-GUIDE.md):
//   1. In Stripe Dashboard → Developers → Webhooks → Add endpoint
//      URL: https://YOUR-SITE.netlify.app/.netlify/functions/stripe-webhook
//      Event to send: checkout.session.completed
//   2. Copy the "Signing secret" Stripe gives you into Netlify's
//      environment variables as STRIPE_WEBHOOK_SECRET

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const email = session.customer_email || session.customer_details?.email;

    if (email) {
      try {
        const store = getStore('abandoned-carts');
        const record = await store.get(email, { type: 'json' });
        if (record) {
          record.recovered = true;
          await store.setJSON(email, record);
        }
      } catch (err) {
        console.error('Could not mark cart as recovered:', err);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
