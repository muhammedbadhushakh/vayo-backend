/* =========================================================
   MY ORDERS / ORDER TRACKING PAGE
   ========================================================= */
const ORDER_STEPS = ["pending", "confirmed", "shipped", "delivered"];

function orderDateShort(o) {
  const raw = o.createdAt;
  if (!raw) return "—";
  const d = raw.toDate ? raw.toDate() : new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function trackerHTML(status) {
  const cancelled = status === "cancelled" || status === "payment_failed" || status === "abandoned";
  if (cancelled) {
    return `<div class="order-track">
      <div class="order-track-step cancelled"><div class="dot"></div><span>${status === "cancelled" ? "Cancelled" : "Payment Not Completed"}</span></div>
    </div>`;
  }
  const idx = ORDER_STEPS.indexOf(status);
  return `<div class="order-track">
    ${ORDER_STEPS.map((s, i) => `<div class="order-track-step ${i <= idx ? "done" : ""}"><div class="dot"></div><span>${s[0].toUpperCase() + s.slice(1)}</span></div>`).join("")}
  </div>`;
}

function orderCardHTML(o) {
  return `
  <div class="order-card">
    <div class="order-card-head">
      <div><b>Order #${o.id.slice(0, 8).toUpperCase()}</b><span>${orderDateShort(o)} · ${(o.items || []).length} item(s)</span></div>
      <div style="text-align:right"><b style="font-family:var(--serif);font-size:1.15rem;color:var(--gold-light)">${fmt(o.total)}</b><span>${o.paymentStatus === "paid" ? "Payment Received" : "Payment " + (o.paymentStatus || "pending")}</span></div>
    </div>
    <div class="order-items-mini">
      ${(o.items || []).map((it) => `<img src="${it.image}" alt="${it.name}" title="${it.name} × ${it.qty}" loading="lazy" decoding="async">`).join("")}
    </div>
    ${trackerHTML(o.status)}
  </div>`;
}

async function loadMyOrders() {
  const list = document.getElementById("ordersList");
  if (!list) return;

  if (typeof window.customerAuthReadyPromise !== "undefined") await window.customerAuthReadyPromise;
  const customer = typeof getCurrentCustomer === "function" ? getCurrentCustomer() : null;
  if (!customer) {
    if (typeof toast === "function") toast("Please login to view your orders", true);
    setTimeout(() => { window.location.href = "login.html?redirect=orders.html"; }, 500);
    return;
  }

  if (typeof DEMO_MODE !== "undefined" && DEMO_MODE) {
    list.innerHTML = `<div class="empty-state"><h3>Connect Firebase to see real orders</h3><p>This is demo mode — orders placed once Firebase is connected will show up here with live tracking.</p></div>`;
    return;
  }

  try {
    const snap = await db.collection("orders").where("customerId", "==", customer.uid).orderBy("createdAt", "desc").get();
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!orders.length) {
      list.innerHTML = `<div class="empty-state"><h3>No orders yet</h3><p>Your orders will show up here once you place one.</p><a href="shop.html" class="btn btn-outline" style="margin-top:20px">Start Shopping</a></div>`;
      return;
    }
    list.innerHTML = orders.map(orderCardHTML).join("");
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><h3>Couldn't load orders</h3><p>${e.message}</p></div>`;
  }
}

document.addEventListener("DOMContentLoaded", loadMyOrders);
