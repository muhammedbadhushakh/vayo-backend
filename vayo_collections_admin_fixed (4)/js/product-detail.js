/* =========================================================
   PRODUCT DETAIL PAGE
   ========================================================= */
function getIdFromURL() {
  return new URLSearchParams(location.search).get("id");
}

async function initProductPage() {
  const id = getIdFromURL();
  const wrap = document.getElementById("productDetail");
  const products = await loadAllProducts();
  const p = products.find((x) => String(x.id) === String(id)) || products[0];

  if (!p) {
    wrap.innerHTML = `<div class="empty-state"><h3>Product not found</h3><p><a href="shop.html">Back to shop</a></p></div>`;
    return;
  }

  document.title = `${p.name} — ${typeof BRAND_NAME !== "undefined" ? BRAND_NAME : "Vayo Collections"}`;
  const crumb = document.getElementById("crumbName");
  if (crumb) crumb.textContent = p.name;

  const out = Number(p.stock) === 0;
  wrap.innerHTML = `
    <div class="qv-grid pd-grid">
      <div class="qv-media"><img src="${p.image}" alt="${p.name}"></div>
      <div class="qv-info">
        <div class="qv-cat">${p.category || ""}</div>
        <h1 style="font-family:var(--serif);font-weight:500;font-size:2rem;margin:.3em 0 .2em">${p.name}</h1>
        <div class="qv-price">${fmt(p.price)} ${p.mrp && p.mrp > p.price ? `<span class="was" style="font-size:1rem">${fmt(p.mrp)}</span>` : ""}</div>
        <p class="qv-desc">${p.description || ""}</p>
        <div class="qv-meta-row">
          <span>${out ? "Out of stock" : (p.stock ?? "In") + " in stock"}</span>
          <span>Free shipping across India</span>
          <span>Secure payment via Razorpay</span>
        </div>
        <div class="field" style="max-width:130px">
          <label>Quantity</label>
          <div class="qty-box" id="pdQty" style="width:110px">
            <button data-d="-1">−</button><span id="pdQtyVal">1</span><button data-d="1">+</button>
          </div>
        </div>
        <div class="qv-actions">
          <button class="btn btn-solid" id="pdAddBtn" ${out ? "disabled" : ""}>${out ? "Out of Stock" : "Add to Bag"}</button>
          <button class="btn btn-outline" id="pdBuyBtn" ${out ? "disabled" : ""}>Buy Now</button>
          <button class="btn btn-outline" data-wish="${p.id}" onclick="toggleWishlist('${p.id}',this)">${typeof isWishlisted === "function" && isWishlisted(p.id) ? "♥ Wishlisted" : "♡ Add to Wishlist"}</button>
          <button class="btn btn-outline qv-share-btn" id="pdShareBtn" aria-label="Share this product">
            <svg viewBox="0 0 24 24" stroke-width="1.6"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.7l7.4-4.2M8.3 13.3l7.4 4.2"/></svg>
            Share
          </button>
        </div>
      </div>
    </div>`;

  let qty = 1;
  wrap.querySelectorAll("#pdQty button").forEach((btn) => {
    btn.addEventListener("click", () => {
      qty = Math.max(1, qty + Number(btn.dataset.d));
      document.getElementById("pdQtyVal").textContent = qty;
    });
  });
  document.getElementById("pdAddBtn")?.addEventListener("click", () => addToCart(p.id, qty));
  document.getElementById("pdBuyBtn")?.addEventListener("click", () => {
    addToCart(p.id, qty, false);
    window.location.href = "checkout.html";
  });
  document.getElementById("pdShareBtn")?.addEventListener("click", () => shareProduct(p.id, p.name));

  const related = products.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);
  const relWrap = document.getElementById("relatedGrid");
  if (relWrap) {
    const list = related.length ? related : products.filter((x) => x.id !== p.id).slice(0, 4);
    relWrap.innerHTML = list.map(productCardHTML).join("");
    bindProductCardButtons(relWrap);
  }

  if (typeof initReviews === "function") initReviews(p);
}
document.addEventListener("DOMContentLoaded", initProductPage);
