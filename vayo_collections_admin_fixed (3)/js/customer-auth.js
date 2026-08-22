/* =========================================================
   CUSTOMER AUTH — shared on every storefront page
   -----------------------------------------------------------
   Handles the shopper login/signup used to gate "Add to Bag"
   and "Checkout". Uses Firebase Auth (email/password) once a
   real project is connected; falls back to a localStorage
   "demo" login (same UX) while DEMO_MODE is on, so the whole
   flow can be tried before Firebase is wired up.
   ========================================================= */

const DEMO_CUSTOMER_KEY = "vayo_demo_customer";

function customerAuthIsDemo() {
  return typeof DEMO_MODE !== "undefined" && DEMO_MODE;
}

function getDemoCustomer() {
  try { return JSON.parse(localStorage.getItem(DEMO_CUSTOMER_KEY) || "null"); }
  catch { return null; }
}
function setDemoCustomer(user) {
  localStorage.setItem(DEMO_CUSTOMER_KEY, JSON.stringify(user));
}
function clearDemoCustomer() {
  localStorage.removeItem(DEMO_CUSTOMER_KEY);
}

/* Resolves once we know whether a shopper is logged in (waits on
   Firebase's async auth check; resolves immediately in demo mode). */
let __resolveCustomerAuthReady;
window.customerAuthReadyPromise = new Promise((res) => (__resolveCustomerAuthReady = res));

function getCurrentCustomer() {
  if (customerAuthIsDemo()) return getDemoCustomer();
  const u = typeof auth !== "undefined" ? auth.currentUser : null;
  if (!u) return null;
  return { uid: u.uid, name: u.displayName || (u.email ? u.email.split("@")[0] : "Account"), email: u.email };
}
function isCustomerLoggedIn() {
  return !!getCurrentCustomer();
}

function customerSignOut() {
  if (customerAuthIsDemo()) {
    clearDemoCustomer();
    window.location.href = "index.html";
    return;
  }
  auth.signOut().then(() => (window.location.href = "index.html"));
}

/* Call before any action that requires a logged-in shopper
   (add to bag, buy now, checkout). Redirects to login.html and
   remembers where to come back to (and what to auto-add) if not. */
function requireCustomerLogin(pending = {}) {
  if (isCustomerLoggedIn()) return true;
  const page = location.pathname.split("/").pop() || "index.html";
  const params = new URLSearchParams();
  params.set("redirect", page);
  if (pending.id) params.set("pendingAdd", pending.id);
  if (pending.qty) params.set("pendingQty", pending.qty);
  if (typeof toast === "function") toast("Please login to continue", true);
  setTimeout(() => { window.location.href = "login.html?" + params.toString(); }, 500);
  return false;
}

/* ---------------- Nav account widget (present on every storefront page) ---------------- */
function renderAccountMenu() {
  const guest = document.getElementById("accGuest");
  const user = document.getElementById("accUser");
  const nameEl = document.getElementById("accName");
  const emailEl = document.getElementById("accEmail");
  const btnLabel = document.getElementById("accountBtnLabel");
  const customer = getCurrentCustomer();

  if (customer) {
    if (guest) guest.style.display = "none";
    if (user) user.style.display = "block";
    if (nameEl) nameEl.textContent = customer.name;
    if (emailEl) emailEl.textContent = customer.email || "";
    if (btnLabel) btnLabel.textContent = customer.name;
  } else {
    if (guest) guest.style.display = "block";
    if (user) user.style.display = "none";
    if (btnLabel) btnLabel.textContent = "Login";
  }
}

function initAccountMenu() {
  const wrap = document.getElementById("accountWrap");
  const btn = document.getElementById("accountBtn");
  if (!wrap || !btn) return;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    wrap.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove("open");
  });
  document.getElementById("accSignOutBtn")?.addEventListener("click", customerSignOut);
}

/* After a successful login, redirect back to where the shopper was and
   silently finish the "Add to Bag" they started before being asked to log in. */
function handlePendingAddFromLogin() {
  const params = new URLSearchParams(location.search);
  const autoAdd = params.get("autoAdd");
  if (!autoAdd || typeof addToCart !== "function") return;
  const qty = Number(params.get("autoQty") || 1);
  addToCart(autoAdd, qty);
  params.delete("autoAdd");
  params.delete("autoQty");
  const rest = params.toString();
  history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
}

const __domReadyPromise = new Promise((res) => document.addEventListener("DOMContentLoaded", res));

document.addEventListener("DOMContentLoaded", () => {
  initAccountMenu();
  renderAccountMenu();
});

if (customerAuthIsDemo()) {
  __resolveCustomerAuthReady(getDemoCustomer());
} else if (typeof auth !== "undefined") {
  auth.onAuthStateChanged((user) => {
    __resolveCustomerAuthReady(user);
    renderAccountMenu();
    document.dispatchEvent(new CustomEvent("customerAuth:changed"));
  });
}

Promise.all([window.customerAuthReadyPromise, __domReadyPromise]).then(handlePendingAddFromLogin);
