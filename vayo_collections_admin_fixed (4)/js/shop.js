/* =========================================================
   SHOP PAGE — full product grid with filters, search & sort
   ========================================================= */
const shopState = { all: [], filtered: [], category: "All", gender: "All", sort: "featured", q: "" };

// If a page is dedicated to one category (bracelets.html, necklaces.html, etc.)
// it sets <body data-category="Bracelets">. That locks the grid to that
// category and skips the "pick a category first" waiting state.
function lockedCategory() {
  return document.body?.dataset.category || null;
}

// Maps a category name to its dedicated page. Categories without a
// dedicated page fall back to filtering on shop.html itself.
const CATEGORY_PAGES = {
  Bracelets: "bracelets.html",
  Necklaces: "necklaces.html",
  Rings: "rings.html",
  Earrings: "earrings.html",
  Bangles: "bangles.html",
  Chains: "chains.html",
};

function readCategoryFromURL() {
  const locked = lockedCategory();
  if (locked) return locked;
  const params = new URLSearchParams(location.search);
  return params.get("category") || "All";
}
function readGenderFromURL() {
  const params = new URLSearchParams(location.search);
  const g = params.get("gender");
  return g === "Women" || g === "Men" || g === "Unisex" ? g : "All";
}

async function initShop() {
  shopState.category = readCategoryFromURL();
  shopState.gender = readGenderFromURL();
  shopState.q = new URLSearchParams(location.search).get("search")?.trim().toLowerCase() || "";

  const grid = document.getElementById("productGrid");
  grid.innerHTML = Array.from({ length: 8 })
    .map(() => `<div class="pcard"><div class="pcard-media skeleton"></div><div class="pcard-body"><div class="skeleton" style="height:14px;width:60%"></div><div class="skeleton" style="height:18px;width:80%;margin-top:8px"></div></div></div>`)
    .join("");

  shopState.all = await loadAllProducts();
  buildGenderTabs();
  buildCategoryChips();
  updateShopHeading();
  applyFilters();

  const shopSearchInput = document.getElementById("shopSearch");
  if (shopSearchInput && shopState.q) shopSearchInput.value = shopState.q;

  shopSearchInput?.addEventListener("input", (e) => {
    shopState.q = e.target.value.trim().toLowerCase();
    applyFilters();
  });
  document.getElementById("shopSort")?.addEventListener("change", (e) => {
    shopState.sort = e.target.value;
    applyFilters();
  });
}

function buildGenderTabs() {
  const wrap = document.getElementById("genderStrip");
  if (!wrap) return;
  const genders = ["All", "Women", "Men"];

  // "Top Collection" isn't a gender filter — it's a link out to the
  // dedicated Top Collection page, carrying the current gender along.
  const topUrl = new URL("top-collection.html", location.href);
  if (shopState.gender !== "All") topUrl.searchParams.set("gender", shopState.gender);
  const topLink = `<a href="${topUrl.pathname}${topUrl.search}" class="gender-tab">Top Collection</a>`;

  wrap.innerHTML =
    `<button class="gender-tab ${"All" === shopState.gender ? "active" : ""}" data-gender="All">All</button>` +
    topLink +
    genders
      .slice(1)
      .map((g) => `<button class="gender-tab ${g === shopState.gender ? "active" : ""}" data-gender="${g}">${g}</button>`)
      .join("");
  wrap.querySelectorAll(".gender-tab[data-gender]").forEach((btn) => {
    btn.addEventListener("click", () => {
      shopState.gender = btn.dataset.gender;
      // On a dedicated category page, keep that category locked; only the
      // general shop page resets back to "All" when the gender changes.
      shopState.category = lockedCategory() || "All";
      const url = new URL(location.href);
      if (shopState.gender === "All") url.searchParams.delete("gender");
      else url.searchParams.set("gender", shopState.gender);
      url.searchParams.delete("category");
      history.replaceState(null, "", url);
      buildGenderTabs();
      buildCategoryChips();
      updateShopHeading();
      applyFilters();
    });
  });
}

function updateShopHeading() {
  const eyebrow = document.getElementById("shopEyebrow");
  const heading = document.getElementById("shopHeading");
  const sub = document.getElementById("shopSubhead");
  if (!heading) return;
  const locked = lockedCategory();
  if (locked) {
    const genderLabel = shopState.gender !== "All" ? `${shopState.gender}'s ` : "";
    if (eyebrow) eyebrow.textContent = shopState.gender !== "All" ? `${shopState.gender}'s Collection` : "Category";
    heading.innerHTML = `Shop <em>${genderLabel}${locked}</em>`;
    if (sub) sub.textContent = `Handpicked ${locked.toLowerCase()} — every piece quality-checked and shipped across India.`;
    return;
  }
  if (shopState.gender === "Women") {
    if (eyebrow) eyebrow.textContent = "Women's Collection";
    heading.innerHTML = `Shop <em>Women's</em>`;
    if (sub) sub.textContent = "Everyday minimal pieces to full bridal sets — every piece quality-checked and shipped across India.";
  } else if (shopState.gender === "Men") {
    if (eyebrow) eyebrow.textContent = "Men's Collection";
    heading.innerHTML = `Shop <em>Men's</em>`;
    if (sub) sub.textContent = "Chains, bracelets and rings built for everyday wear — every piece quality-checked and shipped across India.";
  } else {
    if (eyebrow) eyebrow.textContent = "Full Collection";
    heading.innerHTML = `Shop the <em>Collection</em>`;
    if (sub) sub.textContent = "Everyday minimal pieces to full bridal sets — every piece quality-checked and shipped across India.";
  }
}

function genderScopedProducts() {
  if (shopState.gender === "All") return shopState.all;
  if (shopState.gender === "Unisex") return shopState.all.filter((p) => p.gender === "Unisex");
  return shopState.all.filter((p) => p.gender === shopState.gender || p.gender === "Unisex");
}

// Fallback image per category name, used when no product in that category has its own image yet.
const CATEGORY_IMAGES = {
  All: "https://images.unsplash.com/photo-1611652022419-a9419f74343d?q=80&w=600&auto=format&fit=crop",
  Necklaces: "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?q=80&w=600&auto=format&fit=crop",
  Earrings: "https://images.unsplash.com/photo-1630019852942-f89202989a59?q=80&w=600&auto=format&fit=crop",
  Rings: "https://images.unsplash.com/photo-1677466891766-703a8454158d?q=80&w=600&auto=format&fit=crop",
  Bracelets: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=600&auto=format&fit=crop",
  Bangles: "https://images.unsplash.com/photo-1567567557645-8450247d194a?q=80&w=600&auto=format&fit=crop",
  Chains: "https://images.unsplash.com/photo-1633555234296-657a18d8b81a?q=80&w=600&auto=format&fit=crop",
  "Bridal Sets": "https://images.unsplash.com/photo-1598560917505-59a3ad559071?q=80&w=600&auto=format&fit=crop",
};
function categoryTileImage(cat, scoped) {
  const withImg = scoped.find((p) => p.category === cat && p.image);
  if (withImg) return withImg.image;
  return CATEGORY_IMAGES[cat] || CATEGORY_IMAGES.All;
}

// Where a category tile should navigate to: its dedicated page if one
// exists, otherwise shop.html filtered by ?category=. Gender is carried
// along so the shopper doesn't lose their Women/Men selection.
function categoryHref(cat) {
  const gender = shopState.gender;
  let base;
  if (cat === "All") {
    base = "shop.html";
  } else {
    base = CATEGORY_PAGES[cat] || `shop.html?category=${encodeURIComponent(cat)}`;
  }
  const url = new URL(base, location.href);
  if (gender !== "All") url.searchParams.set("gender", gender);
  return url.pathname.split("/").pop() + (url.search || "");
}

function buildCategoryChips() {
  const wrap = document.getElementById("catStrip");

  // On a dedicated category page (necklaces.html, rings.html, etc.) the
  // category has already been chosen — don't show the tile row again,
  // just the products for that category.
  if (lockedCategory()) {
    wrap.innerHTML = "";
    wrap.style.display = "none";
    return;
  }

  // Category tiles only make sense once a gender is picked — under "All" there's
  // nothing chosen yet, so keep the strip hidden until Men/Women/Unisex is active.
  if (shopState.gender === "All") {
    wrap.innerHTML = "";
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "";

  const scoped = genderScopedProducts();
  const cats = ["All", ...new Set(scoped.map((p) => p.category).filter(Boolean))];
  // Each tile is a plain link to that category's own page — clicking it
  // navigates away instead of filtering the current page in place.
  wrap.innerHTML = cats
    .map(
      (c) => `
      <a class="cat-chip ${c === shopState.category ? "active" : ""}" href="${categoryHref(c)}">
        <img src="${categoryTileImage(c, scoped)}" alt="${c}" loading="lazy">
        <span class="cat-chip-label">${c}</span>
      </a>`
    )
    .join("");
}

function applyFilters() {
  let list = genderScopedProducts();
  if (shopState.category !== "All") list = list.filter((p) => p.category === shopState.category);
  if (shopState.q) {
    list = list.filter((p) => (p.name + " " + (p.category || "")).toLowerCase().includes(shopState.q));
  }
  if (shopState.sort === "price-asc") list = [...list].sort((a, b) => a.price - b.price);
  else if (shopState.sort === "price-desc") list = [...list].sort((a, b) => b.price - a.price);
  else if (shopState.sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));

  shopState.filtered = list;
  renderShopGrid();
}

function renderShopGrid() {
  const grid = document.getElementById("productGrid");
  const count = document.getElementById("resultCount");

  // Once a gender (Women/Men) is picked on the general shop page, wait for
  // the shopper to click into an actual category page before showing
  // individual products. Dedicated category pages (locked) skip this.
  const waitingForCategory = !lockedCategory() && shopState.gender !== "All" && shopState.category === "All" && !shopState.q;
  if (waitingForCategory) {
    grid.style.display = "none";
    grid.innerHTML = "";
    if (count) count.textContent = "";
    return;
  }
  grid.style.display = "";

  if (count) count.textContent = `${shopState.filtered.length} piece${shopState.filtered.length === 1 ? "" : "s"}`;

  if (!shopState.filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>No pieces here yet</h3><p>Try another category or search term.</p></div>`;
    return;
  }
  grid.innerHTML = shopState.filtered.map(productCardHTML).join("");
  bindProductCardButtons(grid);
}

document.addEventListener("DOMContentLoaded", initShop);
