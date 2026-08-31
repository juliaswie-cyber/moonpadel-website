// Runs automatically once a day (Netlify Scheduled Functions — no server
// or cron job for you to manage). Checks every saved cart, and for any
// that are older than 2 hours, not yet reminded, and not recovered
// (meaning: they never came back to pay), sends a follow-up email.
//
// Setup required (see ADD-ONS-GUIDE.md):
//   1. Create a free account at resend.com
//   2. Verify a sending domain (or use their test address while testing)
//   3. Get your API key, add it to Netlify env vars as RESEND_API_KEY
//   4. Set FROM_EMAIL in Netlify env vars, e.g. "Moon Padel <hello@moonpadel.org>"

import { getStore } from '@netlify/blobs';

const PRODUCT_NAMES = {
  lunar: 'Lunar', eclipse: 'Eclipse', supernova: 'Supernova', supernovax: 'Supernova X',
  overgrip3: 'Overgrip (3-Pack)', overgrip12: 'Overgrip (12-Pack)',
};

export default async (req) => {
  const store = getStore('abandoned-carts');
  const { blobs } = await store.list();

  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  let sentCount = 0;

  for (const blobEntry of blobs) {
    const record = await store.get(blobEntry.key, { type: 'json' });
    if (!record) continue;

    const createdAt = new Date(record.createdAt).getTime();
    if (record.recovered || record.reminded || createdAt > twoHoursAgo) continue;

    const itemsText = record.items
      .map(i => `${i.qty} × ${PRODUCT_NAMES[i.id] || i.id}`)
      .join(', ');

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.FROM_EMAIL,
          to: record.email,
          subject: 'You left something in your cart',
          html: `
            <p>Hi,</p>
            <p>You left ${itemsText} in your Moon Padel cart. Head back whenever you're ready — your cart is saved.</p>
            <p><a href="${process.env.URL}">Return to Moon Padel</a></p>
            <p>Spanish craftsmanship. Elite performance. Unmatched quality.</p>
          `,
        }),
      });

      record.reminded = true;
      await store.setJSON(blobEntry.key, record);
      sentCount++;
    } catch (err) {
      console.error(`Failed to send reminder to ${record.email}:`, err);
    }
  }

  console.log(`Abandoned-cart reminders sent: ${sentCount}`);
};

export const config = {
  schedule: '@daily',
};
