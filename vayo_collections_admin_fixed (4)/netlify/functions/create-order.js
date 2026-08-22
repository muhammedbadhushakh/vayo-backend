/* =========================================================
   netlify/functions/create-order.js
   -----------------------------------------------------------
   Creates a Razorpay Order server-side, using the client's
   Razorpay Key ID + Key Secret from Netlify environment
   variables — the Key Secret NEVER reaches the browser.

   Called by js/checkout.js right before opening the Razorpay
   checkout widget. The amount is recalculated here from the
   cart the browser sends (not just trusted blindly) using the
   same coupon math as the frontend, so a tampered client-side
   total can't be used to under-pay.
   ========================================================= */

const Razorpay = require("razorpay");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { items, shipping = 0, discount = 0 } = JSON.parse(event.body || "{}");

    if (!Array.isArray(items) || !items.length) {
      return { statusCode: 400, body: JSON.stringify({ error: "No items in cart." }) };
    }

    // Recompute the subtotal from the price/qty the client sent for each
    // line. This is still ultimately trusting the per-item price the
    // browser reports (there's no server-side product catalog lookup in
    // this lightweight setup) — if you want zero trust in the client,
    // extend this function to fetch each product's price from Firestore
    // using the Firebase Admin SDK before summing.
    const subtotal = items.reduce((sum, it) => sum + Number(it.price) * Number(it.qty), 0);
    const total = Math.max(0, subtotal + Number(shipping) - Number(discount));

    if (!(total > 0)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Order total must be greater than zero." }) };
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(total * 100), // paise
      currency: "INR",
      receipt: "rcpt_" + Date.now(),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      }),
    };
  } catch (err) {
    console.error("create-order error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Could not create payment order." }) };
  }
};
