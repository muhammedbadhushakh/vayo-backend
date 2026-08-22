/* =========================================================
   ADMIN DASHBOARD
   ========================================================= */

const fmt = (n) => Number(n || 0).toLocaleString("en-IN") + "/-";

// Firestore's streamed connection can get silently killed by some networks
// (corporate wifi, VPNs, antivirus HTTPS-scanning) — the request never
// errors, it just never resolves, so any `await db.collection(...).get()`
// can hang forever with zero console output. `experimentalForceLongPolling`
// in firebase-config.js helps, but doesn't fully protect the very first read
// (the admin check below), which everything else depends on. Wrapping reads
// in withTimeout() turns that silent infinite hang into a clear, catchable
// error after a few seconds so the UI can show something actionable instead
// of leaving every stat stuck on "—" forever.
function withTimeout(promise, ms = 15000, label = "request") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out — check your internet connection, or a firewall/VPN/antivirus may be blocking the connection to the database.`)), ms)
    ),
  ]);
}

function toast(msg, isError = false) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.add("show");
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => el.classList.remove("show"), 2600);
}

// A regular toast() auto-hides after 2.6s, which isn't enough time to read
// a network troubleshooting message or find a retry button. This puts a
// persistent banner at the top of the page instead, for connection-level
// failures (as opposed to routine per-action errors, which still use toast).
function showConnectionError(message, onRetry) {
  let banner = document.getElementById("connErrorBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "connErrorBanner";
    banner.style.cssText =
      "position:sticky;top:0;z-index:999;background:#5c1f1f;color:#fff;padding:12px 20px;font-size:.85rem;display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap;text-align:center";
    document.body.prepend(banner);
  }
  banner.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = "⚠ " + message;
  banner.appendChild(text);
  if (onRetry) {
    const btn = document.createElement("button");
    btn.textContent = "Retry";
    btn.style.cssText = "background:#fff;color:#5c1f1f;border:none;padding:5px 14px;border-radius:4px;font-weight:600;cursor:pointer";
    btn.addEventListener("click", onRetry);
    banner.appendChild(btn);
  }
}

// Shown the instant sign-in succeeds, before the (up to 8s) admin-check read
// resolves, so the page never just sits there with no feedback at all while
// it's actually still working.
function showConnectingStatus(message) {
  let el = document.getElementById("connectingBanner");
  if (!el) {
    el = document.createElement("div");
    el.id = "connectingBanner";
    el.style.cssText =
      "position:sticky;top:0;z-index:999;background:#1f3d33;color:#fff;padding:10px 20px;font-size:.85rem;text-align:center";
    document.body.prepend(el);
  }
  el.textContent = message;
}
function hideConnectingStatus() {
  document.getElementById("connectingBanner")?.remove();
}

function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

// Wire up every modal's ✕ button and backdrop click to close it (applies to
// all modals: product, category, coupon, banner, instagram, facebook).
document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
});
document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay.open").forEach((overlay) => closeModal(overlay.id));
  }
});

/* ---------------- Auth guard ---------------- */
// UI wiring (buttons/forms/modals) is attached immediately, on page load,
// regardless of auth — so "Add Product" etc. always opens its form even if
// the admin check below is slow, failing, or misconfigured. Only the actual
// DATA (loadProducts, loadOrders, ...) and SAVING require a confirmed admin
// account, since Firestore rules enforce that server-side anyway.
// NOTE: wireDashboardUI() is actually invoked at the very bottom of this
// file, not here — it depends on `const ALL_TABS` and other consts
// declared later in the file, and calling it this early would throw
// "Cannot access 'ALL_TABS' before initialization" (TDZ error).

if (typeof DEMO_MODE !== "undefined" && DEMO_MODE) {
  toast("Connect Firebase to use the admin panel — see README.md", true);
} else {
  // Matches the persistence mode set in admin/index.html — admin sessions
  // shouldn't survive a full browser restart even if someone bookmarks
  // dashboard.html directly and lands here without going through the
  // login page first.
  auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(() => {});

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    // Confirm this signed-in account is actually an admin (has a doc in
    // /admins/{uid}) before loading data — otherwise any regular shopper
    // account could reach this page (they still couldn't write anything
    // thanks to firestore.rules, but they shouldn't see admin data at all).
    //
    // Everything else on this page (loadDashboardData) waits on this one
    // read resolving. If it hangs, the whole dashboard silently sits on
    // its placeholder "—" values forever, so it's wrapped in withTimeout()
    // with a retry path rather than left to hang indefinitely.
    //
    // This first read is also the slowest-feeling moment on the whole page
    // (up to 8s before anything visibly happens), so show an immediate,
    // honest status instead of letting the dashboard just sit there looking
    // frozen from the very first frame.
    showConnectingStatus("Connecting to the database…");
    try {
      const adminDoc = await withTimeout(db.collection("admins").doc(user.uid).get(), 8000, "Admin check");
      if (!adminDoc.exists) {
        hideConnectingStatus();
        toast("This account is not an admin. Ask an existing admin to add your UID to the /admins collection in Firestore.", true);
        return;
      }
    } catch (e) {
      hideConnectingStatus();
      showConnectionError(e.message, () => location.reload());
      return;
    }
    hideConnectingStatus();
    document.getElementById("adminEmail").textContent = user.email;
    loadDashboardData();
  });
}

document.getElementById("signOutBtn")?.addEventListener("click", () => {
  auth.signOut().then(() => (window.location.href = "index.html"));
});

/* ---------------- Tabs ---------------- */
function showTab(tab) {
  document.querySelectorAll(".tab-section").forEach((s) => (s.style.display = "none"));
  document.getElementById("tab-" + tab).style.display = "block";
  document.querySelectorAll("[data-tab]").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
}
document.querySelectorAll("[data-tab]").forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    showTab(a.dataset.tab);
    history.replaceState(null, "", "#" + a.dataset.tab);
  });
});

/* ---------------- Init ---------------- */
let allProducts = [];
let allOrders = [];

const ALL_TABS = ["overview", "products", "orders", "categories", "homepage", "instagram", "facebook", "social", "customers", "coupons", "banners", "reviews", "reports", "settings"];

function loadDashboardData() {
  loadProducts();
  loadOrders();
  loadCategories();
  loadCoupons();
  loadBanners();
  loadReviews();
  loadSettings();
  loadHomepage();
  loadInstagramPosts();
  loadFacebookPosts();
  loadSocialSettings();
}

function wireDashboardUI() {
  const initialTab = location.hash.replace("#", "") || "overview";
  showTab(ALL_TABS.includes(initialTab) ? initialTab : "overview");

  document.getElementById("addProductBtn").addEventListener("click", () => openProductForm());
  document.getElementById("productForm").addEventListener("submit", handleProductSave);
  setupGalleryUploader();
  setupSizeChips();

  document.getElementById("addCategoryBtn")?.addEventListener("click", () => openCategoryForm());
  document.getElementById("categoryForm")?.addEventListener("submit", handleCategorySave);
  bindDropzone("categoryDropzone", "categoryImageInput", "categoryDropzonePreview", "categoryDropzoneText", "categories", (url) => {
    document.getElementById("categoryForm").image.value = url;
  });

  document.getElementById("addCouponBtn")?.addEventListener("click", () => openCouponForm());
  document.getElementById("couponForm")?.addEventListener("submit", handleCouponSave);

  document.getElementById("addBannerBtn")?.addEventListener("click", () => openBannerForm());
  document.getElementById("bannerForm")?.addEventListener("submit", handleBannerSave);

  document.getElementById("websiteSettingsForm")?.addEventListener("submit", (e) => handleSettingsSave(e, "website"));
  document.getElementById("shippingSettingsForm")?.addEventListener("submit", (e) => handleSettingsSave(e, "shipping"));
  document.getElementById("paymentSettingsForm")?.addEventListener("submit", (e) => handleSettingsSave(e, "payment"));
  bindDropzone("logoDropzone", "logoInput", "logoPreview", "logoText", "logos", (url) => {
    document.getElementById("websiteSettingsForm").logo.value = url;
  });
  bindDropzone("faviconDropzone", "faviconInput", "faviconPreview", "faviconText", "favicons", (url) => {
    document.getElementById("websiteSettingsForm").favicon.value = url;
  });

  // Homepage manager
  document.getElementById("heroForm")?.addEventListener("submit", handleHeroSave);
  document.getElementById("saveSectionsBtn")?.addEventListener("click", saveSectionOrder);
  bindDropzone("heroDesktopDropzone", "heroDesktopInput", "heroDesktopPreview", "heroDesktopText", "homepage", (url) => {
    document.getElementById("heroForm").heroDesktop.value = url;
  });
  bindDropzone("heroMobileDropzone", "heroMobileInput", "heroMobilePreview", "heroMobileText", "homepage", (url) => {
    document.getElementById("heroForm").heroMobile.value = url;
  });

  // Instagram / Facebook managers
  document.getElementById("addInstagramBtn")?.addEventListener("click", () => openInstagramForm());
  document.getElementById("instagramForm")?.addEventListener("submit", handleInstagramSave);
  bindDropzone("instagramDropzone", "instagramInput", "instagramPreview", "instagramDropzoneText", "instagram", (url, file) => {
    const form = document.getElementById("instagramForm");
    form.mediaUrl.value = url;
    form.mediaType.value = file.type.startsWith("video") ? "video" : "image";
  });

  document.getElementById("addFacebookBtn")?.addEventListener("click", () => openFacebookForm());
  document.getElementById("facebookForm")?.addEventListener("submit", handleFacebookSave);
  bindDropzone("facebookDropzone", "facebookInput", "facebookPreview", "facebookDropzoneText", "facebook", (url, file) => {
    const form = document.getElementById("facebookForm");
    form.mediaUrl.value = url;
    form.mediaType.value = file.type.startsWith("video") ? "video" : "image";
  });

  // Social media
  document.getElementById("socialForm")?.addEventListener("submit", handleSocialSave);

  // Customers & Reports depend on orders — load once orders/products are in.
  document.querySelector('[data-tab="customers"]')?.addEventListener("click", renderCustomers);
  document.querySelector('[data-tab="reports"]')?.addEventListener("click", renderReports);
}

/* =========================================================
   GENERIC IMAGE/VIDEO UPLOAD HELPER — reused by every dropzone
   in the dashboard (products, categories, homepage hero, logo,
   favicon, Instagram/Facebook media).
   ========================================================= */
function bindDropzone(zoneId, inputId, previewId, textId, folder, onUploaded, maxSizeMB) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  const text = document.getElementById(textId);
  if (!zone || !input) return;
  const defaultText = text ? text.textContent : "";
  // Keep these in sync with storage.rules per-folder size caps.
  const FOLDER_CAPS_MB = { logos: 15, favicons: 15, homepage: 15, categories: 15, instagram: 15, facebook: 15 };
  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const isVideo = file.type.startsWith("video");
    const capMB = isVideo ? 25 : maxSizeMB || FOLDER_CAPS_MB[folder] || 15;
    const maxSize = capMB * 1024 * 1024;
    if (file.size > maxSize) {
      toast(`File too large — max ${capMB}MB for this upload`, true);
      input.value = "";
      return;
    }
    if (text) text.textContent = "Uploading…";
    try {
      const path = `${folder}/${Date.now()}_${file.name}`;
      const ref = storage.ref(path);
      await ref.put(file);
      const url = await ref.getDownloadURL();
      if (preview) {
        if (file.type.startsWith("video")) {
          preview.style.display = "none";
        } else {
          preview.src = url;
          preview.style.display = "block";
        }
      }
      if (text) text.textContent = file.type.startsWith("video") ? "Video uploaded ✓ — click to replace" : "Click to replace image";
      onUploaded(url, file);
      input.value = "";
    } catch (e) {
      toast("Upload failed: " + e.message, true);
      if (text) text.textContent = defaultText;
    }
  });
}

/* =========================================================
   PRODUCTS
   ========================================================= */
async function loadProducts() {
  try {
    const snap = await withTimeout(db.collection("products").orderBy("createdAt", "desc").get(), 10000, "Loading products");
    allProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    try {
      // orderBy might fail if field doesn't exist on old docs — fall back to plain get
      const snap = await withTimeout(db.collection("products").get(), 10000, "Loading products");
      allProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e2) {
      showConnectionError("Couldn't load products: " + e2.message, () => loadProducts());
      const body = document.getElementById("productsBody");
      if (body) body.innerHTML = `<tr class="empty-row"><td colspan="7">Failed to load products — ${e2.message}</td></tr>`;
      allProducts = [];
      renderStats();
      return;
    }
  }
  renderProducts();
  renderStats();
}

function renderProducts() {
  const body = document.getElementById("productsBody");
  if (!allProducts.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="7">No products yet — click "Add Product" to create your first listing.</td></tr>`;
    return;
  }
  body.innerHTML = allProducts
    .map((p) => {
      const stock = Number(p.stock || 0);
      const stockBadge = stock === 0 ? `<span class="badge outstock">Out of Stock</span>` : stock < 5 ? `<span class="badge lowstock">${stock} left</span>` : `<span class="badge instock">${stock} in stock</span>`;
      const cover = (p.images && p.images[0]) || p.image || "";
      const flags = [p.featured ? `<span class="badge instock">Featured</span>` : "", p.newArrival ? `<span class="badge pending">New</span>` : ""].filter(Boolean).join(" ");
      return `
      <tr>
        <td><div class="row-name"><img class="table-thumb" src="${cover}" onerror="this.style.opacity=0"><div><b>${p.name}</b><span>${p.badge || ""} ${flags}</span></div></div></td>
        <td>${p.category || "—"}</td>
        <td>${p.gender || "—"}</td>
        <td>${p.salePrice ? `<s style="color:var(--muted)">${fmt(p.price)}</s> ${fmt(p.salePrice)}` : fmt(p.price)}</td>
        <td>${stockBadge}</td>
        <td>${p.active === false ? `<span class="badge outstock">Hidden</span>` : `<span class="badge instock">Visible</span>`}</td>
        <td><div class="row-actions">
          <button onclick="openProductForm('${p.id}')">Edit</button>
          <button class="danger" onclick="deleteProduct('${p.id}')">Delete</button>
        </div></td>
      </tr>`;
    })
    .join("");
}

let currentGalleryImages = [];
let currentSizes = [];

function openProductForm(id) {
  const form = document.getElementById("productForm");
  form.reset();
  currentGalleryImages = [];
  currentSizes = [];

  if (id) {
    const p = allProducts.find((x) => x.id === id);
    document.getElementById("productModalTitle").textContent = "Edit Product";
    form.id.value = p.id;
    form.name.value = p.name || "";
    form.category.value = p.category || "";
    form.collection.value = p.collection || "";
    form.gender.value = p.gender || "Women";
    form.badge.value = p.badge || "";
    form.price.value = p.price || "";
    form.mrp.value = p.mrp || "";
    form.salePrice.value = p.salePrice || "";
    form.stock.value = p.stock ?? "";
    form.description.value = p.description || "";
    form.active.value = String(p.active !== false);
    form.featured.checked = !!p.featured;
    form.newArrival.checked = !!p.newArrival;
    currentGalleryImages = p.images && p.images.length ? [...p.images] : p.image ? [p.image] : [];
    currentSizes = p.sizes ? [...p.sizes] : [];
  } else {
    document.getElementById("productModalTitle").textContent = "Add Product";
    form.id.value = "";
  }
  renderGalleryGrid();
  renderSizeChips();
  openModal("productModal");
}

function renderGalleryGrid() {
  const grid = document.getElementById("galleryGrid");
  document.getElementById("productForm").images.value = JSON.stringify(currentGalleryImages);
  if (!currentGalleryImages.length) {
    grid.innerHTML = "";
    return;
  }
  grid.innerHTML = currentGalleryImages
    .map(
      (url, i) => `
    <div class="gallery-item">
      ${i === 0 ? `<span class="gallery-cover-tag">Cover</span>` : ""}
      <img src="${url}" onerror="this.style.opacity=0">
      <div class="gallery-item-actions">
        ${i > 0 ? `<button type="button" onclick="moveGalleryImage(${i},-1)">◀</button>` : ""}
        ${i < currentGalleryImages.length - 1 ? `<button type="button" onclick="moveGalleryImage(${i},1)">▶</button>` : ""}
        <button type="button" onclick="removeGalleryImage(${i})">✕</button>
      </div>
    </div>`
    )
    .join("");
}
function moveGalleryImage(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= currentGalleryImages.length) return;
  [currentGalleryImages[i], currentGalleryImages[j]] = [currentGalleryImages[j], currentGalleryImages[i]];
  renderGalleryGrid();
}
function removeGalleryImage(i) {
  currentGalleryImages.splice(i, 1);
  renderGalleryGrid();
}

function setupGalleryUploader() {
  const zone = document.getElementById("galleryDrop");
  const input = document.getElementById("galleryInput");
  if (!zone) return;
  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    document.getElementById("galleryDropText").textContent = "Uploading…";
    for (const file of files) {
      if (file.size > 15 * 1024 * 1024) {
        toast(`${file.name} is over 15MB — skipped`, true);
        continue;
      }
      try {
        const path = `products/${Date.now()}_${file.name}`;
        const ref = storage.ref(path);
        await ref.put(file);
        const url = await ref.getDownloadURL();
        currentGalleryImages.push(url);
        renderGalleryGrid();
      } catch (e) {
        toast("Image upload failed: " + e.message, true);
      }
    }
    document.getElementById("galleryDropText").textContent = "Click to add image(s) — JPG/PNG, up to 15MB each";
    input.value = "";
  });
}

function renderSizeChips() {
  const wrap = document.getElementById("sizeChipWrap");
  const input = document.getElementById("sizeChipInput");
  document.getElementById("productForm").sizes.value = JSON.stringify(currentSizes);
  wrap.querySelectorAll(".chip").forEach((c) => c.remove());
  currentSizes.forEach((s, i) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `${s} <button type="button" onclick="removeSizeChip(${i})">✕</button>`;
    wrap.insertBefore(chip, input);
  });
}
function removeSizeChip(i) {
  currentSizes.splice(i, 1);
  renderSizeChips();
}
function setupSizeChips() {
  const input = document.getElementById("sizeChipInput");
  if (!input) return;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = input.value.trim().replace(/,$/, "");
      if (val && !currentSizes.includes(val)) {
        currentSizes.push(val);
        renderSizeChips();
      }
      input.value = "";
    }
  });
}

async function handleProductSave(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById("productSaveBtn");
  const id = form.id.value;

  const data = {
    name: form.name.value.trim(),
    category: form.category.value.trim(),
    collection: form.collection.value.trim(),
    gender: form.gender.value,
    badge: form.badge.value.trim(),
    price: Number(form.price.value),
    mrp: form.mrp.value ? Number(form.mrp.value) : null,
    salePrice: form.salePrice.value ? Number(form.salePrice.value) : null,
    stock: Number(form.stock.value),
    description: form.description.value.trim(),
    active: form.active.value === "true",
    featured: form.featured.checked,
    newArrival: form.newArrival.checked,
    sizes: currentSizes,
    images: currentGalleryImages,
    image: currentGalleryImages[0] || "https://images.unsplash.com/photo-1611652022419-a9419f74343d?q=80&w=1000&auto=format&fit=crop",
  };

  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    if (id) {
      await db.collection("products").doc(id).update({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      toast("Product updated");
    } else {
      await db.collection("products").add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      toast("Product added");
    }
    closeModal("productModal");
    loadProducts();
  } catch (err) {
    toast("Error saving product: " + err.message, true);
  }
  btn.disabled = false;
  btn.textContent = "Save Product";
}

async function deleteProduct(id) {
  if (!confirm("Delete this product? This cannot be undone.")) return;
  try {
    await db.collection("products").doc(id).delete();
    toast("Product deleted");
    loadProducts();
  } catch (err) {
    toast("Error deleting product: " + err.message, true);
  }
}

/* =========================================================
   ORDERS
   ========================================================= */
async function loadOrders() {
  try {
    const snap = await withTimeout(db.collection("orders").orderBy("createdAt", "desc").limit(200).get(), 10000, "Loading orders");
    allOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    try {
      const snap = await withTimeout(db.collection("orders").get(), 10000, "Loading orders");
      allOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e2) {
      showConnectionError("Couldn't load orders: " + e2.message, () => loadOrders());
      allOrders = [];
    }
  }
  renderOrders();
  renderStats();
}

function orderDate(o) {
  if (!o.createdAt) return "—";
  if (o.createdAt.toDate) return o.createdAt.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return new Date(o.createdAt).toLocaleDateString("en-IN");
}

function renderOrders() {
  const body = document.getElementById("ordersBody");
  if (!allOrders.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="7">No orders yet.</td></tr>`;
    return;
  }
  body.innerHTML = allOrders
    .map(
      (o) => `
    <tr>
      <td>#${o.id.slice(0, 8)}</td>
      <td>${o.customer?.name || "—"}<br><span style="color:var(--muted);font-size:.75rem">${o.customer?.phone || ""}</span></td>
      <td>${(o.items || []).length} item(s)</td>
      <td>${fmt(o.total)}</td>
      <td><span class="badge ${o.paymentStatus === "paid" ? "paid" : "pending"}">${o.paymentStatus || "unpaid"}</span></td>
      <td>
        <select class="status-select" onchange="updateOrderStatus('${o.id}', this.value)">
          ${["pending", "confirmed", "shipped", "delivered", "cancelled"]
            .map((s) => `<option value="${s}" ${o.status === s ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`)
            .join("")}
        </select>
      </td>
      <td>${orderDate(o)}</td>
    </tr>`
    )
    .join("");

  const recentBody = document.getElementById("recentOrdersBody");
  if (recentBody) {
    const recent = allOrders.slice(0, 5);
    recentBody.innerHTML = recent.length
      ? recent
          .map(
            (o) => `
      <tr>
        <td>#${o.id.slice(0, 8)}</td>
        <td>${o.customer?.name || "—"}</td>
        <td>${fmt(o.total)}</td>
        <td><span class="badge ${o.status}">${o.status}</span></td>
        <td>${orderDate(o)}</td>
      </tr>`
          )
          .join("")
      : `<tr class="empty-row"><td colspan="5">No orders yet.</td></tr>`;
  }
}

async function updateOrderStatus(id, status) {
  try {
    await db.collection("orders").doc(id).update({ status });
    toast("Order status updated");
    const o = allOrders.find((x) => x.id === id);
    if (o) o.status = status;
  } catch (err) {
    toast("Error updating order: " + err.message, true);
  }
}

/* =========================================================
   STATS
   ========================================================= */
function renderStats() {
  document.getElementById("statProducts").textContent = allProducts.length;
  document.getElementById("statCategories").textContent = allCategories.length;
  document.getElementById("statOrders").textContent = allOrders.length;
  const revenue = allOrders.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + Number(o.total || 0), 0);
  document.getElementById("statRevenue").textContent = fmt(revenue);
  const lowStockProducts = allProducts.filter((p) => Number(p.stock || 0) < 5);
  document.getElementById("statLowStock").textContent = lowStockProducts.length;
  document.getElementById("statPending").textContent = allOrders.filter((o) => o.status === "pending").length;
  document.getElementById("statNewArrivals").textContent = allProducts.filter((p) => p.newArrival).length;

  const uniqueCustomers = new Set(allOrders.map((o) => o.customerId).filter(Boolean)).size;
  document.getElementById("statCustomers").textContent = uniqueCustomers;

  const lowStockBody = document.getElementById("lowStockBody");
  if (lowStockBody) {
    lowStockBody.innerHTML = lowStockProducts.length
      ? lowStockProducts
          .slice(0, 8)
          .map((p) => `<tr><td>${p.name}</td><td>${p.category || "—"}</td><td>${Number(p.stock || 0) === 0 ? `<span class="badge outstock">Out of Stock</span>` : `<span class="badge lowstock">${p.stock} left</span>`}</td></tr>`)
          .join("")
      : `<tr class="empty-row"><td colspan="3">Nothing low on stock right now.</td></tr>`;
  }

  renderCustomers();
  renderReports();
}

/* =========================================================
   CATEGORIES
   ========================================================= */
let allCategories = [];

async function loadCategories() {
  try {
    const snap = await withTimeout(db.collection("categories").get(), 10000, "Loading categories");
    allCategories = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    allCategories = [];
  }
  allCategories.sort((a, b) => (Number(a.displayOrder) || 0) - (Number(b.displayOrder) || 0));
  renderCategories();
  renderStats();
}

function renderCategories() {
  const body = document.getElementById("categoriesBody");
  if (!body) return;
  if (!allCategories.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="5">No categories yet — click "Add Category" or just type a new category name on any product.</td></tr>`;
    return;
  }
  body.innerHTML = allCategories
    .map((c) => {
      const count = allProducts.filter((p) => p.category === c.name).length;
      return `
      <tr>
        <td>${c.displayOrder ?? 0}</td>
        <td><div class="row-name"><img class="table-thumb" src="${c.image || ""}" onerror="this.style.opacity=0"><div><b>${c.name}</b></div></div></td>
        <td>${count} product${count === 1 ? "" : "s"}</td>
        <td>${c.active === false ? `<span class="badge outstock">Hidden</span>` : `<span class="badge instock">Active</span>`}</td>
        <td><div class="row-actions">
          <button onclick="openCategoryForm('${c.id}')">Edit</button>
          <button class="danger" onclick="deleteCategory('${c.id}')">Delete</button>
        </div></td>
      </tr>`;
    })
    .join("");
}

function openCategoryForm(id) {
  const form = document.getElementById("categoryForm");
  form.reset();
  document.getElementById("categoryDropzonePreview").style.display = "none";
  document.getElementById("categoryDropzoneText").textContent = "Click to upload an image (JPG/PNG, up to 15MB)";
  if (id) {
    const c = allCategories.find((x) => x.id === id);
    document.getElementById("categoryModalTitle").textContent = "Edit Category";
    form.id.value = c.id;
    form.name.value = c.name || "";
    form.description.value = c.description || "";
    form.image.value = c.image || "";
    form.displayOrder.value = c.displayOrder ?? "";
    form.active.value = String(c.active !== false);
    if (c.image) {
      document.getElementById("categoryDropzonePreview").src = c.image;
      document.getElementById("categoryDropzonePreview").style.display = "block";
      document.getElementById("categoryDropzoneText").textContent = "Click to replace image";
    }
  } else {
    document.getElementById("categoryModalTitle").textContent = "Add Category";
    form.id.value = "";
  }
  openModal("categoryModal");
}

async function handleCategorySave(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById("categorySaveBtn");
  const id = form.id.value;
  const data = {
    name: form.name.value.trim(),
    description: form.description.value.trim(),
    image: form.image.value.trim(),
    displayOrder: form.displayOrder.value ? Number(form.displayOrder.value) : 0,
    active: form.active.value === "true",
  };
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    if (id) await db.collection("categories").doc(id).update(data);
    else await db.collection("categories").add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    toast("Category saved");
    closeModal("categoryModal");
    loadCategories();
  } catch (err) {
    toast("Error saving category: " + err.message, true);
  }
  btn.disabled = false;
  btn.textContent = "Save Category";
}

async function deleteCategory(id) {
  if (!confirm("Delete this category? Products already using this name won't be affected.")) return;
  try {
    await db.collection("categories").doc(id).delete();
    toast("Category deleted");
    loadCategories();
  } catch (err) {
    toast("Error deleting category: " + err.message, true);
  }
}

/* =========================================================
   CUSTOMERS  (derived from the `users` collection + order history)
   ========================================================= */
let allCustomers = [];
let customersLoaded = false;

async function loadCustomersOnce() {
  if (customersLoaded) return;
  try {
    const snap = await withTimeout(db.collection("users").get(), 10000, "Loading customers");
    allCustomers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    customersLoaded = true;
  } catch (e) {
    allCustomers = [];
  }
}

async function renderCustomers() {
  const body = document.getElementById("customersBody");
  if (!body) return;
  await loadCustomersOnce();

  // Fold in any customer that has placed an order but has no /users doc
  // (e.g. accounts created before this feature existed).
  const byId = new Map(allCustomers.map((c) => [c.id, { ...c }]));
  allOrders.forEach((o) => {
    if (!o.customerId) return;
    if (!byId.has(o.customerId)) {
      byId.set(o.customerId, { id: o.customerId, name: o.customer?.name || "—", email: o.customer?.email || "—" });
    }
  });
  const list = Array.from(byId.values());

  if (!list.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="5">No customers yet.</td></tr>`;
    return;
  }

  body.innerHTML = list
    .map((c) => {
      const custOrders = allOrders.filter((o) => o.customerId === c.id);
      const spent = custOrders.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + Number(o.total || 0), 0);
      const joined = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
      return `
      <tr>
        <td><b>${c.name || "—"}</b></td>
        <td>${c.email || "—"}</td>
        <td>${custOrders.length}</td>
        <td>${fmt(spent)}</td>
        <td>${joined}</td>
      </tr>`;
    })
    .join("");
}

/* =========================================================
   COUPONS
   ========================================================= */
let allCoupons = [];

async function loadCoupons() {
  try {
    const snap = await withTimeout(db.collection("coupons").get(), 10000, "Loading coupons");
    allCoupons = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    allCoupons = [];
  }
  renderCoupons();
}

function renderCoupons() {
  const body = document.getElementById("couponsBody");
  if (!body) return;
  if (!allCoupons.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="7">No coupons yet — click "Add Coupon" to create one.</td></tr>`;
    return;
  }
  body.innerHTML = allCoupons
    .map((c) => {
      const discount = c.type === "flat" ? fmt(c.value) + " off" : `${c.value}% off`;
      const uses = c.maxUses ? `${c.usedCount || 0} / ${c.maxUses}` : `${c.usedCount || 0} / ∞`;
      const expires = c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("en-IN") : "—";
      return `
      <tr>
        <td><b>${(c.code || "").toUpperCase()}</b></td>
        <td>${discount}</td>
        <td>${c.minOrder ? fmt(c.minOrder) : "—"}</td>
        <td>${uses}</td>
        <td>${expires}</td>
        <td>${c.active === false ? `<span class="badge outstock">Disabled</span>` : `<span class="badge instock">Active</span>`}</td>
        <td><div class="row-actions">
          <button onclick="openCouponForm('${c.id}')">Edit</button>
          <button class="danger" onclick="deleteCoupon('${c.id}')">Delete</button>
        </div></td>
      </tr>`;
    })
    .join("");
}

function openCouponForm(id) {
  const form = document.getElementById("couponForm");
  form.reset();
  if (id) {
    const c = allCoupons.find((x) => x.id === id);
    document.getElementById("couponModalTitle").textContent = "Edit Coupon";
    form.id.value = c.id;
    form.code.value = c.code || "";
    form.type.value = c.type || "percent";
    form.value.value = c.value ?? "";
    form.minOrder.value = c.minOrder ?? "";
    form.maxUses.value = c.maxUses ?? "";
    form.expiresAt.value = c.expiresAt || "";
    form.active.value = String(c.active !== false);
  } else {
    document.getElementById("couponModalTitle").textContent = "Add Coupon";
    form.id.value = "";
  }
  openModal("couponModal");
}

async function handleCouponSave(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById("couponSaveBtn");
  const id = form.id.value;
  const data = {
    code: form.code.value.trim().toUpperCase(),
    type: form.type.value,
    value: Number(form.value.value),
    minOrder: form.minOrder.value ? Number(form.minOrder.value) : 0,
    maxUses: form.maxUses.value ? Number(form.maxUses.value) : null,
    expiresAt: form.expiresAt.value || null,
    active: form.active.value === "true",
  };
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    if (id) {
      await db.collection("coupons").doc(id).update(data);
    } else {
      await db.collection("coupons").add({ ...data, usedCount: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    toast("Coupon saved");
    closeModal("couponModal");
    loadCoupons();
  } catch (err) {
    toast("Error saving coupon: " + err.message, true);
  }
  btn.disabled = false;
  btn.textContent = "Save Coupon";
}

async function deleteCoupon(id) {
  if (!confirm("Delete this coupon?")) return;
  try {
    await db.collection("coupons").doc(id).delete();
    toast("Coupon deleted");
    loadCoupons();
  } catch (err) {
    toast("Error deleting coupon: " + err.message, true);
  }
}

/* =========================================================
   BANNERS
   ========================================================= */
let allBanners = [];

async function loadBanners() {
  try {
    const snap = await withTimeout(db.collection("banners").get(), 10000, "Loading banners");
    allBanners = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    allBanners = [];
  }
  renderBanners();
}

function renderBanners() {
  const body = document.getElementById("bannersBody");
  if (!body) return;
  if (!allBanners.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="5">No banners yet — click "Add Banner" to create one for the homepage.</td></tr>`;
    return;
  }
  body.innerHTML = allBanners
    .map(
      (b) => `
      <tr>
        <td><img class="table-thumb" style="width:64px;height:36px" src="${b.image || ""}" onerror="this.style.opacity=0"></td>
        <td>${b.title || "—"}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.link || "—"}</td>
        <td>${b.active === false ? `<span class="badge outstock">Hidden</span>` : `<span class="badge instock">Active</span>`}</td>
        <td><div class="row-actions">
          <button onclick="openBannerForm('${b.id}')">Edit</button>
          <button class="danger" onclick="deleteBanner('${b.id}')">Delete</button>
        </div></td>
      </tr>`
    )
    .join("");
}

function openBannerForm(id) {
  const form = document.getElementById("bannerForm");
  form.reset();
  if (id) {
    const b = allBanners.find((x) => x.id === id);
    document.getElementById("bannerModalTitle").textContent = "Edit Banner";
    form.id.value = b.id;
    form.image.value = b.image || "";
    form.title.value = b.title || "";
    form.link.value = b.link || "";
    form.active.value = String(b.active !== false);
  } else {
    document.getElementById("bannerModalTitle").textContent = "Add Banner";
    form.id.value = "";
  }
  openModal("bannerModal");
}

async function handleBannerSave(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById("bannerSaveBtn");
  const id = form.id.value;
  const data = {
    image: form.image.value.trim(),
    title: form.title.value.trim(),
    link: form.link.value.trim(),
    active: form.active.value === "true",
  };
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    if (id) await db.collection("banners").doc(id).update(data);
    else await db.collection("banners").add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    toast("Banner saved");
    closeModal("bannerModal");
    loadBanners();
  } catch (err) {
    toast("Error saving banner: " + err.message, true);
  }
  btn.disabled = false;
  btn.textContent = "Save Banner";
}

async function deleteBanner(id) {
  if (!confirm("Delete this banner?")) return;
  try {
    await db.collection("banners").doc(id).delete();
    toast("Banner deleted");
    loadBanners();
  } catch (err) {
    toast("Error deleting banner: " + err.message, true);
  }
}

/* =========================================================
   REVIEWS  (moderation — customers submit from the product page)
   ========================================================= */
let allReviews = [];

async function loadReviews() {
  try {
    const snap = await withTimeout(db.collection("reviews").orderBy("createdAt", "desc").get(), 10000, "Loading reviews");
    allReviews = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    try {
      const snap = await withTimeout(db.collection("reviews").get(), 10000, "Loading reviews");
      allReviews = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e2) {
      allReviews = [];
    }
  }
  renderReviews();
}

function renderReviews() {
  const body = document.getElementById("reviewsBody");
  if (!body) return;
  if (!allReviews.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="6">No reviews yet.</td></tr>`;
    return;
  }
  body.innerHTML = allReviews
    .map(
      (r) => `
      <tr>
        <td>${r.productName || r.productId || "—"}</td>
        <td>${r.customerName || "Anonymous"}</td>
        <td>${"★".repeat(Number(r.rating) || 0)}${"☆".repeat(5 - (Number(r.rating) || 0))}</td>
        <td style="max-width:260px">${r.comment || ""}</td>
        <td>${r.approved ? `<span class="badge instock">Approved</span>` : `<span class="badge pending">Pending</span>`}</td>
        <td><div class="row-actions">
          ${r.approved ? "" : `<button onclick="approveReview('${r.id}')">Approve</button>`}
          <button class="danger" onclick="deleteReview('${r.id}')">Delete</button>
        </div></td>
      </tr>`
    )
    .join("");
}

async function approveReview(id) {
  try {
    await db.collection("reviews").doc(id).update({ approved: true });
    toast("Review approved");
    loadReviews();
  } catch (err) {
    toast("Error approving review: " + err.message, true);
  }
}
async function deleteReview(id) {
  if (!confirm("Delete this review?")) return;
  try {
    await db.collection("reviews").doc(id).delete();
    toast("Review deleted");
    loadReviews();
  } catch (err) {
    toast("Error deleting review: " + err.message, true);
  }
}

/* =========================================================
   REPORTS
   ========================================================= */
function renderReports() {
  const revEl = document.getElementById("repRevenue30");
  if (!revEl) return;

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const toMs = (o) => (o.createdAt?.toDate ? o.createdAt.toDate().getTime() : o.createdAt ? new Date(o.createdAt).getTime() : 0);
  const recent = allOrders.filter((o) => toMs(o) >= cutoff);
  const paidRecent = recent.filter((o) => o.paymentStatus === "paid");
  const revenue30 = paidRecent.reduce((s, o) => s + Number(o.total || 0), 0);

  revEl.textContent = fmt(revenue30);
  document.getElementById("repOrders30").textContent = recent.length;
  document.getElementById("repAOV").textContent = paidRecent.length ? fmt(revenue30 / paidRecent.length) : fmt(0);
  const uniqueCustomers = new Set(allOrders.map((o) => o.customerId).filter(Boolean)).size;
  document.getElementById("repConv").textContent = uniqueCustomers ? (allOrders.length / uniqueCustomers).toFixed(2) : "—";

  // Top products by units sold across all paid orders
  const salesMap = {};
  allOrders
    .filter((o) => o.paymentStatus === "paid")
    .forEach((o) => {
      (o.items || []).forEach((it) => {
        if (!salesMap[it.name]) salesMap[it.name] = { units: 0, revenue: 0 };
        salesMap[it.name].units += Number(it.qty || 0);
        salesMap[it.name].revenue += Number(it.qty || 0) * Number(it.price || 0);
      });
    });
  const top = Object.entries(salesMap)
    .sort((a, b) => b[1].units - a[1].units)
    .slice(0, 8);
  const topBody = document.getElementById("topProductsBody");
  if (topBody) {
    topBody.innerHTML = top.length
      ? top.map(([name, d]) => `<tr><td>${name}</td><td>${d.units}</td><td>${fmt(d.revenue)}</td></tr>`).join("")
      : `<tr class="empty-row"><td colspan="3">No paid orders yet.</td></tr>`;
  }

  // Orders by status — simple horizontal bar breakdown
  const statuses = ["pending", "confirmed", "shipped", "delivered", "cancelled", "payment_failed", "abandoned"];
  const counts = statuses.map((s) => allOrders.filter((o) => o.status === s).length);
  const max = Math.max(1, ...counts);
  const statusWrap = document.getElementById("statusBreakdown");
  if (statusWrap) {
    statusWrap.innerHTML = statuses
      .map((s, i) => {
        const pct = Math.round((counts[i] / max) * 100);
        return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
          <span style="width:120px;font-size:.78rem;color:var(--muted);text-transform:capitalize">${s.replace("_", " ")}</span>
          <div style="flex:1;background:var(--border-soft);height:8px"><div style="width:${pct}%;background:var(--gold);height:8px"></div></div>
          <span style="width:30px;text-align:right;font-size:.78rem;color:var(--cream)">${counts[i]}</span>
        </div>`;
      })
      .join("");
  }
}

/* =========================================================
   SETTINGS  (website / shipping / payment)
   ========================================================= */
async function loadSettings() {
  const forms = { website: document.getElementById("websiteSettingsForm"), shipping: document.getElementById("shippingSettingsForm"), payment: document.getElementById("paymentSettingsForm") };
  for (const [key, form] of Object.entries(forms)) {
    if (!form) continue;
    try {
      const doc = await withTimeout(db.collection("settings").doc(key).get(), 10000, "Loading settings");
      if (doc.exists) {
        const data = doc.data();
        Object.keys(data).forEach((k) => {
          if (form[k]) form[k].value = data[k];
        });
        if (key === "website") {
          if (data.logo) {
            document.getElementById("logoPreview").src = data.logo;
            document.getElementById("logoPreview").style.display = "block";
            document.getElementById("logoText").textContent = "Click to replace logo";
          }
          if (data.favicon) {
            document.getElementById("faviconPreview").src = data.favicon;
            document.getElementById("faviconPreview").style.display = "block";
            document.getElementById("faviconText").textContent = "Click to replace favicon";
          }
        }
      }
    } catch (e) {
      // fine — form just stays blank until first save
    }
  }
}

async function handleSettingsSave(e, key) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const data = {};
  new FormData(form).forEach((v, k) => (data[k] = v));
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Saving…";
  try {
    await db.collection("settings").doc(key).set({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    toast("Settings saved");
  } catch (err) {
    toast("Error saving settings: " + err.message, true);
  }
  btn.disabled = false;
  btn.textContent = original;
}

/* =========================================================
   HOMEPAGE MANAGER
   settings/homepage doc: { heroDesktop, heroMobile, heading,
   subtitle, btnText, btnLink, sections:[{id,label,enabled}] }
   ========================================================= */
const DEFAULT_HOMEPAGE_SECTIONS = [
  { id: "hero", label: "Hero Banner" },
  { id: "categories", label: "Categories" },
  { id: "promoBanners", label: "Promotional Banners" },
  { id: "featured", label: "Featured Products" },
  { id: "newArrivals", label: "New Arrivals" },
  { id: "men", label: "Men's Section" },
  { id: "women", label: "Women's Section" },
  { id: "collections", label: "Collections" },
  { id: "instagram", label: "Instagram Feed" },
  { id: "facebook", label: "Facebook Highlights" },
];

let currentSections = [];

async function loadHomepage() {
  const form = document.getElementById("heroForm");
  if (!form) return;
  try {
    const doc = await withTimeout(db.collection("settings").doc("homepage").get(), 10000, "Loading homepage settings");
    const data = doc.exists ? doc.data() : {};
    form.heading.value = data.heading || "";
    form.subtitle.value = data.subtitle || "";
    form.btnText.value = data.btnText || "";
    form.btnLink.value = data.btnLink || "";
    form.heroDesktop.value = data.heroDesktop || "";
    form.heroMobile.value = data.heroMobile || "";
    if (data.heroDesktop) {
      document.getElementById("heroDesktopPreview").src = data.heroDesktop;
      document.getElementById("heroDesktopPreview").style.display = "block";
      document.getElementById("heroDesktopText").textContent = "Click to replace image";
    }
    if (data.heroMobile) {
      document.getElementById("heroMobilePreview").src = data.heroMobile;
      document.getElementById("heroMobilePreview").style.display = "block";
      document.getElementById("heroMobileText").textContent = "Click to replace image";
    }
    // Merge saved section state with the default list (so newly-added
    // section types always show up even on an older saved doc).
    const saved = Array.isArray(data.sections) ? data.sections : [];
    if (saved.length) {
      const savedIds = saved.map((s) => s.id);
      currentSections = [...saved, ...DEFAULT_HOMEPAGE_SECTIONS.filter((s) => !savedIds.includes(s.id)).map((s) => ({ ...s, enabled: true }))];
    } else {
      currentSections = DEFAULT_HOMEPAGE_SECTIONS.map((s) => ({ ...s, enabled: true }));
    }
  } catch (e) {
    currentSections = DEFAULT_HOMEPAGE_SECTIONS.map((s) => ({ ...s, enabled: true }));
  }
  renderSectionOrderList();
}

function renderSectionOrderList() {
  const wrap = document.getElementById("sectionOrderList");
  if (!wrap) return;
  wrap.innerHTML = currentSections
    .map((s, i) => {
      const label = s.label || (DEFAULT_HOMEPAGE_SECTIONS.find((d) => d.id === s.id) || {}).label || s.id;
      return `
    <div class="reorder-row ${s.enabled === false ? "is-disabled" : ""}">
      <label class="switch"><input type="checkbox" ${s.enabled === false ? "" : "checked"} onchange="toggleSection(${i})"><span class="slider"></span></label>
      <span class="rr-label">${label}</span>
      <div class="rr-btns">
        ${i > 0 ? `<button type="button" onclick="moveSection(${i},-1)">▲</button>` : ""}
        ${i < currentSections.length - 1 ? `<button type="button" onclick="moveSection(${i},1)">▼</button>` : ""}
      </div>
    </div>`;
    })
    .join("");
}
function toggleSection(i) {
  currentSections[i].enabled = currentSections[i].enabled === false ? true : false;
  renderSectionOrderList();
}
function moveSection(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= currentSections.length) return;
  [currentSections[i], currentSections[j]] = [currentSections[j], currentSections[i]];
  renderSectionOrderList();
}
async function saveSectionOrder() {
  const btn = document.getElementById("saveSectionsBtn");
  btn.disabled = true;
  try {
    await db.collection("settings").doc("homepage").set({ sections: currentSections, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    toast("Homepage section order saved — live instantly, no redeploy needed");
  } catch (err) {
    toast("Error saving section order: " + err.message, true);
  }
  btn.disabled = false;
}

async function handleHeroSave(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById("heroSaveBtn");
  const data = {
    heading: form.heading.value.trim(),
    subtitle: form.subtitle.value.trim(),
    btnText: form.btnText.value.trim(),
    btnLink: form.btnLink.value.trim(),
    heroDesktop: form.heroDesktop.value,
    heroMobile: form.heroMobile.value,
  };
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await db.collection("settings").doc("homepage").set({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    toast("Hero section saved");
  } catch (err) {
    toast("Error saving hero section: " + err.message, true);
  }
  btn.disabled = false;
  btn.textContent = "Save Hero Section";
}

/* =========================================================
   INSTAGRAM MANAGER  (collection: instagramPosts)
   ========================================================= */
let allInstagramPosts = [];

async function loadInstagramPosts() {
  const grid = document.getElementById("instagramGrid");
  if (!grid) return;
  try {
    const snap = await withTimeout(db.collection("instagramPosts").orderBy("createdAt", "desc").get(), 10000, "Loading Instagram posts");
    allInstagramPosts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    try {
      const snap = await withTimeout(db.collection("instagramPosts").get(), 10000, "Loading Instagram posts");
      allInstagramPosts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e2) {
      allInstagramPosts = [];
    }
  }
  renderInstagramGrid();
}

function contentCardHTML(post, opts) {
  const media =
    post.mediaType === "video"
      ? `<video class="cc-media" src="${post.mediaUrl || ""}" muted></video>`
      : `<img class="cc-media" src="${post.mediaUrl || ""}" onerror="this.style.opacity=0">`;
  return `
    <div class="content-card">
      ${media}
      <div class="cc-body">
        <b>${opts.title || ""}</b>
        <p>${post.caption || ""}</p>
      </div>
      <div class="cc-foot">
        <span class="badge ${post.active === false ? "outstock" : "instock"}">${post.active === false ? "Hidden" : "Visible"}</span>
        <div class="row-actions">
          <button onclick="${opts.editFn}('${post.id}')">Edit</button>
          <button class="danger" onclick="${opts.deleteFn}('${post.id}')">Delete</button>
        </div>
      </div>
    </div>`;
}

function renderInstagramGrid() {
  const grid = document.getElementById("instagramGrid");
  if (!allInstagramPosts.length) {
    grid.innerHTML = `<p style="color:var(--muted)">No Instagram content yet — click "+ Add Post" to feature one on the website.</p>`;
    return;
  }
  grid.innerHTML = allInstagramPosts.map((p) => contentCardHTML(p, { title: p.igUrl ? "Instagram Post" : "Post", editFn: "openInstagramForm", deleteFn: "deleteInstagramPost" })).join("");
}

function openInstagramForm(id) {
  const form = document.getElementById("instagramForm");
  form.reset();
  document.getElementById("instagramPreview").style.display = "none";
  document.getElementById("instagramDropzoneText").textContent = "Click to upload image (up to 15MB) or video (up to 25MB)";
  if (id) {
    const p = allInstagramPosts.find((x) => x.id === id);
    document.getElementById("instagramModalTitle").textContent = "Edit Instagram Post";
    form.id.value = p.id;
    form.mediaUrl.value = p.mediaUrl || "";
    form.mediaType.value = p.mediaType || "image";
    form.caption.value = p.caption || "";
    form.igUrl.value = p.igUrl || "";
    form.linkType.value = p.linkType || "none";
    form.linkValue.value = p.linkValue || "";
    form.active.value = String(p.active !== false);
    if (p.mediaType !== "video" && p.mediaUrl) {
      document.getElementById("instagramPreview").src = p.mediaUrl;
      document.getElementById("instagramPreview").style.display = "block";
    }
  } else {
    document.getElementById("instagramModalTitle").textContent = "Add Instagram Post";
    form.id.value = "";
  }
  openModal("instagramModal");
}

async function handleInstagramSave(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById("instagramSaveBtn");
  const id = form.id.value;
  const data = {
    mediaUrl: form.mediaUrl.value,
    mediaType: form.mediaType.value || "image",
    caption: form.caption.value.trim(),
    igUrl: form.igUrl.value.trim(),
    linkType: form.linkType.value,
    linkValue: form.linkValue.value.trim(),
    active: form.active.value === "true",
  };
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    if (id) await db.collection("instagramPosts").doc(id).update(data);
    else await db.collection("instagramPosts").add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    toast("Instagram post saved");
    closeModal("instagramModal");
    loadInstagramPosts();
  } catch (err) {
    toast("Error saving post: " + err.message, true);
  }
  btn.disabled = false;
  btn.textContent = "Save Post";
}

async function deleteInstagramPost(id) {
  if (!confirm("Delete this Instagram post?")) return;
  try {
    await db.collection("instagramPosts").doc(id).delete();
    toast("Post deleted");
    loadInstagramPosts();
  } catch (err) {
    toast("Error deleting post: " + err.message, true);
  }
}

/* =========================================================
   FACEBOOK MANAGER  (collection: facebookPosts)
   ========================================================= */
let allFacebookPosts = [];

async function loadFacebookPosts() {
  const grid = document.getElementById("facebookGrid");
  if (!grid) return;
  try {
    const snap = await withTimeout(db.collection("facebookPosts").orderBy("createdAt", "desc").get(), 10000, "Loading Facebook posts");
    allFacebookPosts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    try {
      const snap = await withTimeout(db.collection("facebookPosts").get(), 10000, "Loading Facebook posts");
      allFacebookPosts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e2) {
      allFacebookPosts = [];
    }
  }
  renderFacebookGrid();
}

function renderFacebookGrid() {
  const grid = document.getElementById("facebookGrid");
  if (!allFacebookPosts.length) {
    grid.innerHTML = `<p style="color:var(--muted)">No Facebook content yet — click "+ Add Post" to feature one on the website.</p>`;
    return;
  }
  grid.innerHTML = allFacebookPosts.map((p) => contentCardHTML(p, { title: p.title || "Facebook Post", editFn: "openFacebookForm", deleteFn: "deleteFacebookPost" })).join("");
}

function openFacebookForm(id) {
  const form = document.getElementById("facebookForm");
  form.reset();
  document.getElementById("facebookPreview").style.display = "none";
  document.getElementById("facebookDropzoneText").textContent = "Click to upload image (up to 15MB) or video (up to 25MB)";
  if (id) {
    const p = allFacebookPosts.find((x) => x.id === id);
    document.getElementById("facebookModalTitle").textContent = "Edit Facebook Post";
    form.id.value = p.id;
    form.mediaUrl.value = p.mediaUrl || "";
    form.mediaType.value = p.mediaType || "image";
    form.title.value = p.title || "";
    form.caption.value = p.caption || "";
    form.fbUrl.value = p.fbUrl || "";
    form.linkType.value = p.linkType || "none";
    form.linkValue.value = p.linkValue || "";
    form.active.value = String(p.active !== false);
    if (p.mediaType !== "video" && p.mediaUrl) {
      document.getElementById("facebookPreview").src = p.mediaUrl;
      document.getElementById("facebookPreview").style.display = "block";
    }
  } else {
    document.getElementById("facebookModalTitle").textContent = "Add Facebook Post";
    form.id.value = "";
  }
  openModal("facebookModal");
}

async function handleFacebookSave(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById("facebookSaveBtn");
  const id = form.id.value;
  const data = {
    mediaUrl: form.mediaUrl.value,
    mediaType: form.mediaType.value || "image",
    title: form.title.value.trim(),
    caption: form.caption.value.trim(),
    fbUrl: form.fbUrl.value.trim(),
    linkType: form.linkType.value,
    linkValue: form.linkValue.value.trim(),
    active: form.active.value === "true",
  };
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    if (id) await db.collection("facebookPosts").doc(id).update(data);
    else await db.collection("facebookPosts").add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    toast("Facebook post saved");
    closeModal("facebookModal");
    loadFacebookPosts();
  } catch (err) {
    toast("Error saving post: " + err.message, true);
  }
  btn.disabled = false;
  btn.textContent = "Save Post";
}

async function deleteFacebookPost(id) {
  if (!confirm("Delete this Facebook post?")) return;
  try {
    await db.collection("facebookPosts").doc(id).delete();
    toast("Post deleted");
    loadFacebookPosts();
  } catch (err) {
    toast("Error deleting post: " + err.message, true);
  }
}

/* =========================================================
   SOCIAL MEDIA LINKS  (settings/social doc)
   ========================================================= */
async function loadSocialSettings() {
  const form = document.getElementById("socialForm");
  if (!form) return;
  try {
    const doc = await withTimeout(db.collection("settings").doc("social").get(), 10000, "Loading social settings");
    if (doc.exists) {
      const data = doc.data();
      Object.keys(data).forEach((k) => {
        if (!form[k]) return;
        if (form[k].type === "checkbox") form[k].checked = !!data[k];
        else form[k].value = data[k];
      });
    }
  } catch (e) {
    // stays blank until first save
  }
}

async function handleSocialSave(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const data = {};
  Array.from(form.elements).forEach((el) => {
    if (!el.name) return;
    data[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
  });
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Saving…";
  try {
    await db.collection("settings").doc("social").set({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    toast("Social links saved");
  } catch (err) {
    toast("Error saving social links: " + err.message, true);
  }
  btn.disabled = false;
  btn.textContent = original;
}

/* ---------------- Boot ---------------- */
// Runs last, after every function/const above has been declared.
wireDashboardUI();
