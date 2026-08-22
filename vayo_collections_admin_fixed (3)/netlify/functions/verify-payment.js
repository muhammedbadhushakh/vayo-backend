/* =========================================================
   netlify/functions/verify-payment.js
   -----------------------------------------------------------
   Verifies the Razorpay payment signature server-side, and —
   ONLY if verification succeeds — writes the order to Firestore
   using the Firebase Admin SDK (which bypasses firestore.rules,
   since this is a trusted server context, not a browser).

   This is what guarantees "orders are saved to Firestore only
   after successful payment verification": the browser never
   writes the order document itself; it only ever asks this
   function to, and this function refuses unless the signature
   checks out.
   ========================================================= */

const crypto = require("crypto");
const admin = require("firebase-admin");

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      order, // { items, subtotal, shipping, discount, total, couponCode, customer, customerId }
    } = JSON.parse(event.body || "{}");

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !order) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing payment or order details." }) };
    }

    // ---- 1. Verify the signature ----
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return { statusCode: 400, body: JSON.stringify({ error: "Payment verification failed. Signature mismatch." }) };
    }

    // ---- 2. Signature is genuine — now (and only now) save the order ----
    const app = getAdminApp();
    const db = app.firestore();

    const orderDoc = {
      items: order.items || [],
      subtotal: Number(order.subtotal) || 0,
      shipping: Number(order.shipping) || 0,
      discount: Number(order.discount) || 0,
      couponCode: order.couponCode || null,
      total: Number(order.total) || 0,
      customer: order.customer || {},
      customerId: order.customerId || null,
      status: "confirmed",
      paymentStatus: "paid",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection("orders").add(orderDoc);

    // Track coupon usage (best-effort — doesn't block order confirmation).
    if (order.couponCode) {
      try {
        const couponSnap = await db.collection("coupons").where("code", "==", order.couponCode).limit(1).get();
        if (!couponSnap.empty) {
          await couponSnap.docs[0].ref.update({ usedCount: admin.firestore.FieldValue.increment(1) });
        }
      } catch (couponErr) {
        console.warn("Coupon usage tracking failed:", couponErr.message);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, orderId: ref.id }),
    };
  } catch (err) {
    console.error("verify-payment error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Could not verify or save the order." }) };
  }
};
