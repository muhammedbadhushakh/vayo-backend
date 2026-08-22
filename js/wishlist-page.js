/* =========================================================
   WISHLIST PAGE
   ========================================================= */
async function renderWishlistPage() {
  const grid = document.getElementById("wishlistGrid");
  if (!grid) return;
  const ids = getWishlistIds();
  if (!ids.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>Your wishlist is empty</h3><p>Tap the heart on any product to save it here.</p><a href="shop.html" class="btn btn-outline" style="margin-top:20px">Browse the Collection</a></div>`;
    return;
  }
  const products = await loadAllProducts();
  const items = ids.map((id) => products.find((p) => String(p.id) === String(id))).filter(Boolean);
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>Your wishlist is empty</h3><p>Tap the heart on any product to save it here.</p><a href="shop.html" class="btn btn-outline" style="margin-top:20px">Browse the Collection</a></div>`;
    return;
  }
  grid.innerHTML = items.map(productCardHTML).join("");
  bindProductCardButtons(grid);
}

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.customerAuthReadyPromise !== "undefined") await window.customerAuthReadyPromise;
  renderWishlistPage();
});
document.addEventListener("customerAuth:changed", renderWishlistPage);
