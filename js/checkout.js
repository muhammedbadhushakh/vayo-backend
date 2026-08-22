/* =========================================================
   CHECKOUT PAGE + RAZORPAY (via Netlify Functions)
   -----------------------------------------------------------
   Flow:
     1. Show shipping form + order summary on checkout.html
     2. Shopper can optionally apply a coupon code (validated
        against the Firestore `coupons` collection, read-only
        from the browser)
     3. POST /api/create-order (Netlify Function) — creates the
        Razorpay Order server-side, using the Key Secret which
        lives only in Netlify environment variables. The
        function recomputes the total itself; nothing is written
        to Firestore yet.
     4. Open Razorpay checkout with that order_id.
     5. On successful payment, POST /api/verify-payment with the
        Razorpay signature + the order details. That function
        verifies the signature server-side and — ONLY if valid —
        writes the order to Firestore itself (via the Firebase
        Admin SDK). The browser never writes the order document.
     6. Clear the cart and redirect to order-success.html.
   ========================================================= */

const RAZORPAY_KEY_ID = "rzp_test_YOUR_KEY_ID"; // replace with your Key ID (Razorpay Dashboard -> Settings -> API Keys). The Key Secret goes ONLY in Netlify env vars, never here.

const checkoutState = { lines: [], subtotal: 0, shipping: 0, coupon: null, discount: 0 };

async function initCheckoutPage() {
  const wrap = document.getElementById("checkoutContent");
  if (!wrap) return;

  if (typeof window.customerAuthReadyPromise !== "undefined") await window.customerAuthReadyPromise;
  if (typeof requireCustomerLogin === "function" && !requireCustomerLogin()) {
    wrap.innerHTML = `<div class="empty-state"><h3>Please login to checkout</h3><p>Redirecting you to login…</p></div>`;
    document.getElementById("checkoutOrderCard")?.style.setProperty("display", "none");
    return;
  }

  const lines = await cartLines();
  if (!lines.length) {
    wrap.innerHTML = `<div class="empty-state"><h3>Your bag is empty</h3><p>Add something beautiful before checking out.</p><a href="shop.html" class="btn btn-solid" style="margin-top:24px">Shop Now</a></div>`;
    document.getElementById("checkoutOrderCard")?.style.setProperty("display", "none");
    return;
  }

  checkoutState.lines = lines;
  checkoutState.subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  checkoutState.shipping = shippingFor(checkoutState.subtotal);
  checkoutState.coupon = null;
  checkoutState.discount = 0;

  wrap.innerHTML = checkoutFormHTML();
  renderOrderCard();

  const customer = typeof getCurrentCustomer === "function" ? getCurrentCustomer() : null;
  const form = document.getElementById("checkoutForm");
  if (customer && form) {
    if (customer.email) form.email.value = customer.email;
    if (customer.name) form.name.value = customer.name;
  }

  form.addEventListener("submit", handleCheckoutSubmit);
}

function checkoutFormHTML() {
  return `
    <span class="eyebrow">Secure Checkout</span>
    <h2>Shipping Details</h2>
    <p style="color:var(--muted);font-size:.9rem;margin:6px 0 24px">We'll use this to deliver your order and share updates.</p>

    <form id="checkoutForm">
      <div class="form-grid">
        <div class="field"><label>Full Name</label><input required name="name" placeholder="Your name"></div>
        <div class="field"><label>Phone Number</label><input required name="phone" type="tel" pattern="[0-9]{10}" placeholder="10-digit mobile number"></div>
        <div class="field full"><label>Email</label><input required name="email" type="email" placeholder="you@example.com"></div>
        <div class="field full"><label>Address</label><input required name="address" placeholder="House no, street, area"></div>
        <div class="field"><label>City</label><input required name="city" placeholder="City"></div>
        <div class="field"><label>State</label><input required name="state" placeholder="State"></div>
        <div class="field"><label>Pincode</label><input required name="pincode" pattern="[0-9]{6}" placeholder="6-digit pincode"></div>
        <div class="field"><label>Order Notes (optional)</label><input name="notes" placeholder="Gift wrap, etc."></div>
      </div>

      <button type="submit" class="btn btn-solid btn-block" id="payBtn" style="margin-top:10px">
        <span id="payBtnLabel">Pay ${fmt(checkoutState.subtotal + checkoutState.shipping)} with Razorpay</span>
      </button>
      <p style="text-align:center;font-size:.7rem;color:var(--muted);margin-top:14px;letter-spacing:.04em">
        🔒 Payments are processed securely by Razorpay. We never store your card details.
      </p>
    </form>`;
}

function grandTotal() {
  return Math.max(0, checkoutState.subtotal + checkoutState.shipping - checkoutState.discount);
}

function renderOrderCard() {
  const card = document.getElementById("checkoutOrderCard");
  if (!card) return;
  const { lines, subtotal, shipping, coupon, discount } = checkoutState;
  card.innerHTML = `
    <h3>Order Summary</h3>
    ${lines.map((l) => `<div class="checkout-summary-row"><span>${l.product.name} × ${l.qty}</span><span>${fmt(l.product.price * l.qty)}</span></div>`).join("")}
    <div class="checkout-summary-row"><span>Shipping</span><span>${shipping === 0 ? "Free" : fmt(shipping)}</span></div>
    ${discount > 0 ? `<div class="checkout-summary-row"><span>Discount (${coupon.code})</span><span>−${fmt(discount)}</span></div>` : ""}

    ${
      coupon
        ? `<div class="coupon-applied"><span>✓ "${coupon.code}" applied</span><button type="button" onclick="removeCoupon()">Remove</button></div>`
        : `<div class="coupon-row">
             <input type="text" id="couponInput" placeholder="Coupon code" style="text-transform:uppercase">
             <button type="button" class="btn btn-outline btn-sm" id="applyCouponBtn" onclick="applyCoupon()">Apply</button>
           </div>`
    }

    <div class="checkout-summary-row total"><span>Total</span><b>${fmt(grandTotal())}</b></div>
  `;
}

async function applyCoupon() {
  const input = document.getElementById("couponInput");
  const btn = document.getElementById("applyCouponBtn");
  const code = (input?.value || "").trim().toUpperCase();
  if (!code) return;
  btn.disabled = true;
  btn.textContent = "Checking…";

  try {
    if (typeof DEMO_MODE !== "undefined" && DEMO_MODE) {
      toast("Connect Firebase to use real coupon codes", true);
      btn.disabled = false;
      btn.textContent = "Apply";
      return;
    }
    const snap = await db.collection("coupons").where("code", "==", code).limit(1).get();
    if (snap.empty) {
      toast("Invalid coupon code", true);
      btn.disabled = false;
      btn.textContent = "Apply";
      return;
    }
    const doc = snap.docs[0];
    const c = { id: doc.id, ...doc.data() };

    if (c.active === false) throw new Error("This coupon is no longer active");
    if (c.expiresAt && new Date(c.expiresAt) < new Date()) throw new Error("This coupon has expired");
    if (c.minOrder && checkoutState.subtotal < c.minOrder) throw new Error(`Minimum order of ${fmt(c.minOrder)} required`);
    if (c.maxUses && (c.usedCount || 0) >= c.maxUses) throw new Error("This coupon has reached its usage limit");

    const discount = c.type === "flat" ? c.value : Math.round((checkoutState.subtotal * c.value) / 100);
    checkoutState.coupon = c;
    checkoutState.discount = Math.min(discount, checkoutState.subtotal + checkoutState.shipping);
    renderOrderCard();
    resetPayButton();
    toast("Coupon applied!");
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
    btn.textContent = "Apply";
  }
}

function removeCoupon() {
  checkoutState.coupon = null;
  checkoutState.discount = 0;
  renderOrderCard();
  resetPayButton();
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const payBtn = document.getElementById("payBtn");

  const customer = {
    name: form.name.value.trim(),
    phone: form.phone.value.trim(),
    email: form.email.value.trim(),
    address: form.address.value.trim(),
    city: form.city.value.trim(),
    state: form.state.value.trim(),
    pincode: form.pincode.value.trim(),
    notes: form.notes.value.trim(),
  };

  payBtn.disabled = true;
  document.getElementById("payBtnLabel").innerHTML = `<span class="spinner"></span>`;

  const loggedInCustomer = typeof getCurrentCustomer === "function" ? getCurrentCustomer() : null;
  const { lines, subtotal, shipping, coupon, discount } = checkoutState;

  // Nothing is written to Firestore yet — the order only ever gets saved
  // by the verify-payment Netlify Function, and only once Razorpay
  // confirms the payment is genuine.
  const pendingOrder = {
    items: lines.map((l) => ({ id: l.id, name: l.product.name, price: l.product.price, qty: l.qty, image: l.product.image })),
    subtotal,
    shipping,
    couponCode: coupon?.code || null,
    discount,
    total: grandTotal(),
    customer,
    customerId: loggedInCustomer?.uid || null,
  };

  try {
    await launchRazorpay(pendingOrder);
  } catch (err) {
    console.error(err);
    toast(err.message || "Something went wrong. Please try again.", true);
    resetPayButton();
  }
}

async function launchRazorpay(pendingOrder) {
  if (typeof Razorpay === "undefined") {
    throw new Error("Payment gateway failed to load. Check your connection.");
  }

  // ---- 1. Create the Razorpay Order server-side (Netlify Function) ----
  const createRes = await fetch("/api/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: pendingOrder.items, shipping: pendingOrder.shipping, discount: pendingOrder.discount }),
  });
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error || "Could not start the payment. Please try again.");
  }
  const razorpayOrder = await createRes.json();

  const options = {
    key: RAZORPAY_KEY_ID,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    order_id: razorpayOrder.id,
    name: typeof BRAND_NAME !== "undefined" ? BRAND_NAME : "Vayo Collections",
    description: `Order for ${pendingOrder.items.length} item(s)`,
    prefill: {
      name: pendingOrder.customer.name,
      email: pendingOrder.customer.email,
      contact: pendingOrder.customer.phone,
    },
    notes: {
      address: `${pendingOrder.customer.address}, ${pendingOrder.customer.city}, ${pendingOrder.customer.state} - ${pendingOrder.customer.pincode}`,
    },
    theme: { color: "#004741" },

    // ---- 2. On payment success, verify + save (Netlify Function) ----
    handler: async function (response) {
      try {
        const verifyRes = await fetch("/api/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            order: pendingOrder,
          }),
        });
        const result = await verifyRes.json().catch(() => ({}));
        if (!verifyRes.ok || !result.success) {
          throw new Error(result.error || "Payment could not be verified.");
        }

        saveCartRaw([]);
        const params = new URLSearchParams({ payment_id: response.razorpay_payment_id || "", order_id: result.orderId || "" });
        window.location.href = `order-success.html?${params.toString()}`;
      } catch (err) {
        console.error("Payment verification failed:", err);
        toast("Payment received but verification failed — please contact support with payment ID " + response.razorpay_payment_id, true);
        resetPayButton();
      }
    },
    modal: {
      ondismiss: function () {
        resetPayButton();
      },
    },
  };

  const rzp = new Razorpay(options);
  rzp.on("payment.failed", function (response) {
    toast("Payment failed: " + response.error.description, true);
    resetPayButton();
  });
  rzp.open();
}

function resetPayButton() {
  const payBtn = document.getElementById("payBtn");
  if (!payBtn) return;
  payBtn.disabled = false;
  document.getElementById("payBtnLabel").textContent = `Pay ${fmt(grandTotal())} with Razorpay`;
}

document.addEventListener("DOMContentLoaded", initCheckoutPage);
