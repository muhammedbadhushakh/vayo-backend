/* =========================================================
   CART PAGE
   ========================================================= */
async function renderCartPage() {
  const wrap = document.getElementById("cartPageBody");
  const summary = document.getElementById("cartSummary");
  if (!wrap) return;

  const lines = await cartLines();

  if (!lines.length) {
    wrap.innerHTML = `<div class="empty-state"><h3>Your bag is empty</h3><p>Looks like you haven't added anything yet.</p><a href="shop.html" class="btn btn-solid" style="margin-top:24px">Continue Shopping</a></div>`;
    if (summary) summary.style.display = "none";
    document.getElementById("cartPageLayout")?.style.setProperty("grid-template-columns", "1fr");
    return;
  }
  if (summary) summary.style.display = "";

  wrap.innerHTML =
    `<div class="cart-table">` +
    lines
      .map(
        (l) => `
      <div class="cart-row" data-id="${l.id}">
        <img src="${l.product.image}" alt="${l.product.name}" loading="lazy" decoding="async">
        <div class="cart-row-info">
          <a href="product.html?id=${encodeURIComponent(l.id)}" class="name">${l.product.name}</a>
          <div class="meta">${l.product.category || ""}</div>
          <button class="cart-item-remove" data-remove="${l.id}">Remove</button>
        </div>
        <div class="qty-box">
          <button data-qty="-1" data-id="${l.id}">−</button><span>${l.qty}</span><button data-qty="1" data-id="${l.id}">+</button>
        </div>
        <div class="cart-item-price">${fmt(l.product.price * l.qty)}</div>
      </div>`
      )
      .join("") +
    `</div>`;

  wrap.querySelectorAll("[data-qty]").forEach((btn) =>
    btn.addEventListener("click", () => updateQty(btn.dataset.id, Number(btn.dataset.qty)))
  );
  wrap.querySelectorAll("[data-remove]").forEach((btn) =>
    btn.addEventListener("click", () => removeFromCart(btn.dataset.remove))
  );

  const total = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const shipping = shippingFor(total);
  document.getElementById("cartSubtotal").textContent = fmt(total);
  document.getElementById("cartShipping").textContent = shipping === 0 ? "Free" : fmt(shipping);
  document.getElementById("cartGrandTotal").textContent = fmt(total + shipping);
}

document.addEventListener("DOMContentLoaded", renderCartPage);
document.addEventListener("cart:changed", renderCartPage);
