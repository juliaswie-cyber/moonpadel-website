// Creates one combined Stripe Checkout session for everything in the cart,
// AND saves a record of this cart to Netlify Blobs (keyed by email) so the
// abandoned-cart reminder function can follow up if they don't complete payment.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getStore } = require('@netlify/blobs');

const CATALOG = {
  lunar:       { name: 'Moon Padel — Lunar',       price: 17500 },
  eclipse:     { name: 'Moon Padel — Eclipse',     price: 18500 },
  supernova:   { name: 'Moon Padel — Supernova',   price: 20500 },
  supernovax:  { name: 'Moon Padel — Supernova X', price: 22500 },
  overgrip3:   { name: 'Moon Padel Overgrip (3-Pack)',  price: 500 },
  overgrip12:  { name: 'Moon Padel Overgrip (12-Pack)', price: 1500 },
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { items, email } = JSON.parse(event.body);

    if (!Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Cart is empty' }) };
    }
    if (!email || !email.includes('@')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Valid email required' }) };
    }

    const line_items = items.map(({ id, qty }) => {
      const product = CATALOG[id];
      if (!product) throw new Error(`Unknown product: ${id}`);
      return {
        price_data: {
          currency: 'gbp',
          product_data: { name: product.name },
          unit_amount: product.price,
        },
        quantity: Math.max(1, Math.min(qty, 20)),
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      allow_promotion_codes: true,
      customer_email: email,
      shipping_address_collection: { allowed_countries: ['GB'] },
      success_url: `${process.env.URL}/success.html`,
      cancel_url: `${process.env.URL}/`,
    });

    // Save this cart for abandoned-cart follow-up.
    // If they complete payment, the Stripe webhook marks it "recovered"
    // so the reminder email never gets sent.
    try {
      const store = getStore('abandoned-carts');
      await store.setJSON(email, {
        email,
        items,
        stripeSessionId: session.id,
        createdAt: new Date().toISOString(),
        recovered: false,
        reminded: false,
      });
    } catch (blobErr) {
      // Don't block checkout if this fails — abandoned-cart tracking is a
      // nice-to-have, never a reason to stop someone from paying.
      console.error('Could not save abandoned-cart record:', blobErr);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
