/* =========================================================
   WISHLIST — shared on every storefront page
   -----------------------------------------------------------
   Stored in localStorage for instant, no-login browsing feel,
   and mirrored to the Firestore `wishlist` collection (one doc
   per signed-in shopper, keyed by their uid) whenever a real
   Firebase project is connected, so a shopper's wishlist follows
   them across devices once logged in.
   ========================================================= */

const WISHLIST_KEY = "vayo_wishlist";

function getWishlistIds() {
  try {
    return JSON.parse(localStorage.getItem(WISHLIST_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveWishlistIds(ids) {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(ids));
  renderWishlistBadge();
}
function isWishlisted(id) {
  return getWishlistIds().includes(String(id));
}
function renderWishlistBadge() {
  const count = getWishlistIds().length;
  document.querySelectorAll("#wishlistBadge").forEach((b) => (b.textContent = count));
}

async function syncWishlistToCloud(ids) {
  try {
    if (typeof DEMO_MODE === "undefined" || DEMO_MODE) return;
    const customer = typeof getCurrentCustomer === "function" ? getCurrentCustomer() : null;
    if (!customer) return;
    await db.collection("wishlist").doc(customer.uid).set({
      productIds: ids,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn("Wishlist cloud sync failed:", e.message);
  }
}

async function pullWishlistFromCloud() {
  try {
    if (typeof DEMO_MODE === "undefined" || DEMO_MODE) return;
    const customer = typeof getCurrentCustomer === "function" ? getCurrentCustomer() : null;
    if (!customer) return;
    const doc = await db.collection("wishlist").doc(customer.uid).get();
    if (doc.exists) {
      saveWishlistIds(doc.data().productIds || []);
    }
  } catch (e) {
    console.warn("Wishlist cloud pull failed:", e.message);
  }
}

function toggleWishlist(id, btnEl) {
  if (typeof requireCustomerLogin === "function" && !requireCustomerLogin()) return;
  id = String(id);
  const ids = getWishlistIds();
  const idx = ids.indexOf(id);
  let added;
  if (idx > -1) {
    ids.splice(idx, 1);
    added = false;
  } else {
    ids.push(id);
    added = true;
  }
  saveWishlistIds(ids);
  syncWishlistToCloud(ids);
  document.querySelectorAll(`[data-wish="${id}"]`).forEach((b) => {
    b.classList.toggle("active", added);
    if (b.classList.contains("btn")) b.textContent = added ? "♥ Wishlisted" : "♡ Add to Wishlist";
  });
  if (typeof toast === "function") toast(added ? "Added to wishlist" : "Removed from wishlist");
  if (location.pathname.endsWith("wishlist.html") && typeof renderWishlistPage === "function") renderWishlistPage();
}

document.addEventListener("DOMContentLoaded", () => {
  renderWishlistBadge();
  if (typeof window.customerAuthReadyPromise !== "undefined") {
    window.customerAuthReadyPromise.then(pullWishlistFromCloud);
  }
});
