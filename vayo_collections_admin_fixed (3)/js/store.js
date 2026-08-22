/* =========================================================
   VAYO COLLECTION — shared storefront logic
   Loaded on every storefront page (not admin). Handles:
   products, cart state, mini-cart drawer, toast, mobile nav.
   ========================================================= */

const fmt = (n) => Number(n).toLocaleString("en-IN") + "/-";

/* ---------------- Toast ---------------- */
function toast(msg, isError = false) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.add("show");
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ---------------- Products (shared, cached per page-load) ---------------- */
let __productsPromise = null;
function loadAllProducts() {
  if (__productsPromise) return __productsPromise;
  __productsPromise = (async () => {
    let products = [];
    try {
      if (typeof DEMO_MODE !== "undefined" && !DEMO_MODE) {
        const snap = await db.collection("products").get();
        snap.forEach((doc) => {
          const data = doc.data();
          if (data.active !== false) products.push({ id: doc.id, ...data });
        });
      }
    } catch (e) {
      console.warn("Falling back to demo products:", e.message);
    }
    if (!products.length) products = DEMO_PRODUCTS;
    return products;
  })();
  return __productsPromise;
}

async function getProductById(id) {
  const products = await loadAllProducts();
  return products.find((p) => String(p.id) === String(id));
}

/* ---------------- Product card (shared markup) ---------------- */
function productCardHTML(p) {
  const out = Number(p.stock) === 0;
  const href = `product.html?id=${encodeURIComponent(p.id)}`;
  const wished = typeof isWishlisted === "function" && isWishlisted(p.id);
  return `
    <div class="pcard" data-id="${p.id}">
      <a href="${href}" class="pcard-media">
        ${p.badge ? `<span class="pcard-badge ${out ? "out" : ""}">${out ? "Sold Out" : p.badge}</span>` : out ? `<span class="pcard-badge out">Sold Out</span>` : ""}
        <img loading="lazy" src="${p.image}" alt="${p.name}">
        <div class="pcard-quick">View Details</div>
      </a>
      <button class="pcard-wish ${wished ? "active" : ""}" data-wish="${p.id}" aria-label="Toggle wishlist" onclick="event.preventDefault();toggleWishlist('${p.id}',this)">
        <svg viewBox="0 0 24 24" stroke-width="1.6"><path d="M12 21s-7.5-4.7-10-9.3C.5 8 2 4.5 5.5 4c2-.3 3.8.7 5 2.4C11.7 4.7 13.5 3.7 15.5 4 19 4.5 20.5 8 20 11.7 17.5 16.3 12 21 12 21z"/></svg>
      </button>
      <button class="pcard-share" data-share="${p.id}" data-share-name="${p.name.replace(/"/g, "&quot;")}" aria-label="Share this product" title="Share this product">
        <svg viewBox="0 0 24 24" stroke-width="1.6"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.7l7.4-4.2M8.3 13.3l7.4 4.2"/></svg>
      </button>
      <div class="pcard-body">
        <div class="pcard-cat">${p.category || ""}</div>
        <a href="${href}" class="pcard-title">${p.name}</a>
        <div class="pcard-price">
          <span class="now">${fmt(p.price)}</span>
          ${p.mrp && p.mrp > p.price ? `<span class="was">${fmt(p.mrp)}</span>` : ""}
        </div>
        <button class="btn btn-outline btn-sm pcard-add" data-add="${p.id}" ${out ? "disabled" : ""} style="margin-top:10px">${out ? "Sold Out" : "Add to Bag"}</button>
      </div>
    </div>`;
}

function bindProductCardButtons(container) {
  container.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      addToCart(btn.dataset.add);
    });
  });
  container.querySelectorAll("[data-share]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      shareProduct(btn.dataset.share, btn.dataset.shareName || "");
    });
  });
}

/* ---------------- Share (per-product link) ---------------- */
async function shareProduct(id, name) {
  const url = new URL(`product.html?id=${encodeURIComponent(id)}`, location.href).href;
  const title = name ? `${name} — ${typeof BRAND_NAME !== "undefined" ? BRAND_NAME : "Vayo Collections"}` : (typeof BRAND_NAME !== "undefined" ? BRAND_NAME : "Vayo Collections");
  if (navigator.share) {
    try {
      await navigator.share({ title, text: name ? `Check out ${name}` : "Check this out", url });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // user cancelled the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Product link copied");
  } catch {
    window.prompt("Copy this link:", url);
  }
}

/* ---------------- Cart state (localStorage, shared across pages) ---------------- */
const CART_KEY = "vayo_cart";

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveCartRaw(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCartBadge();
}
function cartCount() {
  return getCart().reduce((s, i) => s + i.qty, 0);
}
function renderCartBadge() {
  const count = cartCount();
  document.querySelectorAll(".count-badge").forEach((b) => (b.textContent = count));
}

function addToCart(id, qty = 1, notify = true) {
  if (typeof requireCustomerLogin === "function" && !requireCustomerLogin({ id, qty })) {
    return; // shopper isn't logged in — requireCustomerLogin() is redirecting to login.html
  }
  const cart = getCart();
  const existing = cart.find((i) => i.id === id);
  if (existing) existing.qty += qty;
  else cart.push({ id, qty });
  saveCartRaw(cart);
  refreshMiniCart();
  document.dispatchEvent(new CustomEvent("cart:changed"));
  if (notify) {
    toast("Added to bag");
    openDrawer();
  }
}
function updateQty(id, delta) {
  const cart = getCart();
  const item = cart.find((i) => i.id === id);
  if (!item) return;
  item.qty += delta;
  const newCart = item.qty <= 0 ? cart.filter((i) => i.id !== id) : cart;
  saveCartRaw(newCart);
  refreshMiniCart();
  document.dispatchEvent(new CustomEvent("cart:changed"));
}
function removeFromCart(id) {
  const cart = getCart().filter((i) => i.id !== id);
  saveCartRaw(cart);
  refreshMiniCart();
  document.dispatchEvent(new CustomEvent("cart:changed"));
}

async function cartLines() {
  const products = await loadAllProducts();
  return getCart()
    .map((i) => {
      const p = products.find((x) => String(x.id) === String(i.id));
      return p ? { ...i, product: p } : null;
    })
    .filter(Boolean);
}
function shippingFor(total) {
  return total >= 999 || total === 0 ? 0 : 79;
}

/* ---------------- Mini cart drawer (present on every page) ---------------- */
function openDrawer() {
  document.getElementById("cartOverlay")?.classList.add("open");
  document.getElementById("cartDrawer")?.classList.add("open");
}
function closeDrawer() {
  document.getElementById("cartOverlay")?.classList.remove("open");
  document.getElementById("cartDrawer")?.classList.remove("open");
}

async function refreshMiniCart() {
  const body = document.getElementById("drawerBody");
  if (!body) return;
  const lines = await cartLines();
  if (!lines.length) {
    body.innerHTML = `<div class="drawer-empty">Your bag is empty.<br><br><button class="btn btn-outline btn-sm" onclick="closeDrawer()">Continue Shopping</button></div>`;
  } else {
    body.innerHTML = lines
      .map(
        (l) => `
      <div class="cart-item">
        <img src="${l.product.image}" alt="${l.product.name}" loading="lazy" decoding="async">
        <div class="cart-item-info">
          <div class="name">${l.product.name}</div>
          <div class="meta">${l.product.category || ""}</div>
          <div class="cart-item-row">
            <div class="qty-box">
              <button onclick="updateQty('${l.id}',-1)">−</button>
              <span>${l.qty}</span>
              <button onclick="updateQty('${l.id}',1)">+</button>
            </div>
            <div class="cart-item-price">${fmt(l.product.price * l.qty)}</div>
          </div>
          <button class="cart-item-remove" onclick="removeFromCart('${l.id}')">Remove</button>
        </div>
      </div>`
      )
      .join("");
  }
  const total = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const sub = document.getElementById("drawerSubtotal");
  if (sub) sub.textContent = fmt(total);
  const checkoutBtn = document.getElementById("drawerCheckoutBtn");
  if (checkoutBtn) checkoutBtn.disabled = lines.length === 0;
}

/* ---------------- Mobile nav ---------------- */
function initNav() {
  const burger = document.getElementById("burger");
  const links = document.getElementById("navLinks");
  burger?.addEventListener("click", () => links.classList.toggle("open"));
  links?.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => links.classList.remove("open")));
}

/* ---------------- Header search ---------------- */
function initHeaderSearch() {
  const searchBtn = document.getElementById("searchBtn");
  const panel = document.getElementById("searchPanel");
  const form = document.getElementById("headerSearchForm");
  const input = document.getElementById("headerSearchInput");
  if (!searchBtn || !panel || !form || !input) return;

  function openPanel() {
    panel.classList.add("open");
    setTimeout(() => input.focus(), 150);
  }
  function closePanel() {
    panel.classList.remove("open");
  }

  searchBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.contains("open") ? closePanel() : openPanel();
  });

  document.addEventListener("click", (e) => {
    if (panel.classList.contains("open") && !panel.contains(e.target) && e.target !== searchBtn) closePanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const onFullShop = typeof shopState !== "undefined" && typeof applyFilters === "function" && !document.body?.dataset.category;
    if (onFullShop) {
      shopState.q = q.toLowerCase();
      shopState.category = "All";
      shopState.gender = "All";
      const shopSearchInput = document.getElementById("shopSearch");
      if (shopSearchInput) shopSearchInput.value = q;
      buildGenderTabs();
      buildCategoryChips();
      updateShopHeading();
      applyFilters();
      closePanel();
      document.getElementById("productGrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
      const url = new URL(location.href);
      url.searchParams.set("search", q);
      url.searchParams.delete("category");
      url.searchParams.delete("gender");
      history.replaceState({}, "", url);
    } else {
      window.location.href = "shop.html?search=" + encodeURIComponent(q);
    }
  });

  // if this IS shop.html, prefill from ?search= and keep results filtering live
  const params = new URLSearchParams(location.search);
  const existingQ = params.get("search");
  if (existingQ) input.value = existingQ;
}

/* ---------------- Chrome shared by every storefront page ---------------- */
function initStoreChrome() {
  initNav();
  initHeaderSearch();
  renderCartBadge();
  refreshMiniCart();

  document.getElementById("cartBtn")?.addEventListener("click", () => {
    openDrawer();
    refreshMiniCart();
  });
  document.getElementById("cartCloseBtn")?.addEventListener("click", closeDrawer);
  document.getElementById("cartOverlay")?.addEventListener("click", closeDrawer);
  document.getElementById("drawerCheckoutBtn")?.addEventListener("click", () => {
    window.location.href = "checkout.html";
  });

  document.getElementById("newsletterForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    toast("Thanks for subscribing!");
    e.target.reset();
  });
}
document.addEventListener("DOMContentLoaded", initStoreChrome);
