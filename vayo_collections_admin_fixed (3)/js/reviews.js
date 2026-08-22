/* =========================================================
   PRODUCT REVIEWS — display + submission (product.html)
   ========================================================= */
let __currentReviewProduct = null;

function starPickerHTML(selected) {
  return [1, 2, 3, 4, 5]
    .map((n) => `<span data-star="${n}" style="color:${n <= selected ? "var(--gold)" : "var(--border-soft)"}">★</span>`)
    .join("");
}

function setupStarPicker() {
  const wrap = document.getElementById("starPicker");
  const input = document.querySelector('#reviewForm input[name="rating"]');
  if (!wrap || !input) return;
  let selected = 0;
  const render = () => (wrap.innerHTML = starPickerHTML(selected));
  render();
  wrap.addEventListener("click", (e) => {
    const star = e.target.closest("[data-star]");
    if (!star) return;
    selected = Number(star.dataset.star);
    input.value = selected;
    render();
  });
}

function reviewCardHTML(r) {
  const date = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";
  return `
  <div style="border-bottom:1px solid var(--border-soft);padding:18px 0">
    <div class="stars" style="font-size:.85rem;margin-bottom:6px">${"★".repeat(Number(r.rating) || 0)}${"☆".repeat(5 - (Number(r.rating) || 0))}</div>
    <p style="color:var(--cream);font-size:.92rem;margin-bottom:8px">${r.comment || ""}</p>
    <div style="color:var(--muted);font-size:.75rem;letter-spacing:.06em;text-transform:uppercase">${r.customerName || "Anonymous"} · ${date}</div>
  </div>`;
}

async function loadProductReviews(productId) {
  const list = document.getElementById("reviewsList");
  if (!list) return;
  if (typeof DEMO_MODE !== "undefined" && DEMO_MODE) {
    list.innerHTML = `<p style="color:var(--muted);font-size:.88rem">No reviews yet — be the first once Firebase is connected.</p>`;
    return;
  }
  try {
    const snap = await db.collection("reviews").where("productId", "==", String(productId)).where("approved", "==", true).get();
    const reviews = snap.docs.map((d) => d.data());
    list.innerHTML = reviews.length
      ? reviews.map(reviewCardHTML).join("")
      : `<p style="color:var(--muted);font-size:.88rem">No reviews yet — be the first to share your experience.</p>`;
  } catch (e) {
    list.innerHTML = `<p style="color:var(--muted);font-size:.88rem">No reviews yet — be the first to share your experience.</p>`;
  }
}

async function handleReviewSubmit(e) {
  e.preventDefault();
  if (typeof requireCustomerLogin === "function" && !requireCustomerLogin()) return;
  const form = e.target;
  const rating = Number(form.rating.value);
  const comment = form.comment.value.trim();
  if (!rating) {
    toast("Please pick a star rating", true);
    return;
  }
  const customer = typeof getCurrentCustomer === "function" ? getCurrentCustomer() : null;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = "Submitting…";
  try {
    if (typeof DEMO_MODE === "undefined" || !DEMO_MODE) {
      await db.collection("reviews").add({
        productId: String(__currentReviewProduct.id),
        productName: __currentReviewProduct.name,
        customerId: customer?.uid || null,
        customerName: customer?.name || "Anonymous",
        rating,
        comment,
        approved: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    toast("Thanks! Your review will appear after a quick check.");
    form.reset();
    setupStarPicker();
  } catch (err) {
    toast("Couldn't submit review: " + err.message, true);
  }
  btn.disabled = false;
  btn.textContent = "Submit Review";
}

function initReviews(product) {
  __currentReviewProduct = product;
  loadProductReviews(product.id);
  setupStarPicker();
  document.getElementById("reviewForm")?.addEventListener("submit", handleReviewSubmit);
}
