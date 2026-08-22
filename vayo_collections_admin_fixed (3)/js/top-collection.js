/* =========================================================
   TOP COLLECTION PAGE — our best-selling / most-loved pieces
   -----------------------------------------------------------
   Shows every product that has a "badge" set (Bestseller,
   Trending, Top Pick, etc. — the same field used for the
   featured strip on the home page and set from the Admin
   panel's product form). No badge = not shown here.
   ========================================================= */
const topState = { all: [], filtered: [], gender: "All", category: "All", sort: "featured" };

function readTopGenderFromURL() {
  const params = new URLSearchParams(location.search);
  const g = params.get("gender");
  return g === "Women" || g === "Men" || g === "Unisex" ? g : "All";
}

function readTopCategoryFromURL() {
  const params = new URLSearchParams(location.search);
  return params.get("category") || "All";
}

async function initTopCollection() {
  topState.gender = readTopGenderFromURL();
  topState.category = readTopCategoryFromURL();

  const grid = document.getElementById("productGrid");
  grid.innerHTML = Array.from({ length: 8 })
    .map(() => `<div class="pcard"><div class="pcard-media skeleton"></div><div class="pcard-body"><div class="skeleton" style="height:14px;width:60%"></div><div class="skeleton" style="height:18px;width:80%;margin-top:8px"></div></div></div>`)
    .join("");

  const products = await loadAllProducts();
  topState.all = products.filter((p) => p.badge);

  buildTopGenderTabs();
  buildTopCategoryChips();
  updateTopHeading();
  applyTopFilters();

  document.getElementById("shopSort")?.addEventListener("change", (e) => {
    topState.sort = e.target.value;
    applyTopFilters();
  });
}

function buildTopGenderTabs() {
  const wrap = document.getElementById("genderStrip");
  if (!wrap) return;
  const genders = ["Women", "Men"];
  wrap.innerHTML = genders
    .map((g) => `<button class="gender-tab ${g === topState.gender ? "active" : ""}" data-gender="${g}">${g}</button>`)
    .join("");
  wrap.querySelectorAll(".gender-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      topState.gender = btn.dataset.gender;
      topState.category = "All";
      const url = new URL(location.href);
      if (topState.gender === "All") url.searchParams.delete("gender");
      else url.searchParams.set("gender", topState.gender);
      url.searchParams.delete("category");
      history.replaceState(null, "", url);
      buildTopGenderTabs();
      buildTopCategoryChips();
      updateTopHeading();
      applyTopFilters();
    });
  });
}

// Same eyebrow/heading/subhead pattern as the Shop page, so the Top
// Collection page reads identically once a gender is picked.
function updateTopHeading() {
  const eyebrow = document.getElementById("topEyebrow");
  const heading = document.getElementById("topHeading");
  const sub = document.getElementById("topSubhead");
  if (!heading) return;
  if (topState.gender === "Women") {
    if (eyebrow) eyebrow.textContent = "Women's Collection";
    heading.innerHTML = `Top <em>Picks For Her</em>`;
    if (sub) sub.textContent = "Everyday minimal pieces to full bridal sets — every piece quality-checked and shipped across India.";
  } else if (topState.gender === "Men") {
    if (eyebrow) eyebrow.textContent = "Men's Collection";
    heading.innerHTML = `Top <em>Picks For Him</em>`;
    if (sub) sub.textContent = "Chains, bracelets and rings built for everyday wear — every piece quality-checked and shipped across India.";
  } else {
    if (eyebrow) eyebrow.textContent = "Our Favourites";
    heading.innerHTML = `Top <em>Collection</em>`;
    if (sub) sub.textContent = "The pieces our shoppers reach for again and again — handpicked bestsellers and trending favourites.";
  }
}

// Same fallback images as the Shop page's category tiles, kept local here
// since top-collection.html doesn't load js/shop.js.
const TOP_CATEGORY_IMAGES = {
  All: "https://images.unsplash.com/photo-1611652022419-a9419f74343d?q=80&w=600&auto=format&fit=crop",
  Necklaces: "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?q=80&w=600&auto=format&fit=crop",
  Earrings: "https://images.unsplash.com/photo-1630019852942-f89202989a59?q=80&w=600&auto=format&fit=crop",
  Rings: "https://images.unsplash.com/photo-1677466891766-703a8454158d?q=80&w=600&auto=format&fit=crop",
  Bracelets: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=600&auto=format&fit=crop",
  Bangles: "https://images.unsplash.com/photo-1567567557645-8450247d194a?q=80&w=600&auto=format&fit=crop",
  Chains: "https://images.unsplash.com/photo-1633555234296-657a18d8b81a?q=80&w=600&auto=format&fit=crop",
  "Bridal Sets": "https://images.unsplash.com/photo-1598560917505-59a3ad559071?q=80&w=600&auto=format&fit=crop",
};

function topGenderScopedProducts() {
  if (topState.gender === "All") return topState.all;
  if (topState.gender === "Unisex") return topState.all.filter((p) => p.gender === "Unisex");
  return topState.all.filter((p) => p.gender === topState.gender || p.gender === "Unisex");
}

// Category tiles only make sense once a gender is picked — mirrors the
// Shop page: hidden under "All", shown once Men/Women is active.
function buildTopCategoryChips() {
  const wrap = document.getElementById("catStrip");
  if (!wrap) return;

  if (topState.gender === "All") {
    wrap.innerHTML = "";
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "";

  const scoped = topGenderScopedProducts();
  const cats = ["All", ...new Set(scoped.map((p) => p.category).filter(Boolean))];

  wrap.innerHTML = cats
    .map((c) => {
      const withImg = scoped.find((p) => p.category === c && p.image);
      const img = withImg ? withImg.image : (TOP_CATEGORY_IMAGES[c] || TOP_CATEGORY_IMAGES.All);
      return `
      <button type="button" class="cat-chip ${c === topState.category ? "active" : ""}" data-category="${c}" style="border:none;cursor:pointer;background:none">
        <img src="${img}" alt="${c}" loading="lazy">
        <span class="cat-chip-label">${c}</span>
      </button>`;
    })
    .join("");

  // Chips filter in place — the Top Collection list is a curated subset,
  // so (unlike Shop's chips) there's no separate dedicated page per category.
  wrap.querySelectorAll(".cat-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      topState.category = btn.dataset.category;
      const url = new URL(location.href);
      if (topState.category === "All") url.searchParams.delete("category");
      else url.searchParams.set("category", topState.category);
      history.replaceState(null, "", url);
      buildTopCategoryChips();
      applyTopFilters();
    });
  });
}

function applyTopFilters() {
  let list = topGenderScopedProducts();
  if (topState.category !== "All") list = list.filter((p) => p.category === topState.category);
  if (topState.sort === "price-asc") list = [...list].sort((a, b) => a.price - b.price);
  else if (topState.sort === "price-desc") list = [...list].sort((a, b) => b.price - a.price);
  else if (topState.sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));

  topState.filtered = list;
  renderTopGrid();
}

function renderTopGrid() {
  const grid = document.getElementById("productGrid");
  const count = document.getElementById("resultCount");

  // Once a gender is picked, wait for a category tile to be chosen before
  // showing individual products — same pacing as the Shop page.
  const waitingForCategory = topState.gender !== "All" && topState.category === "All";
  if (waitingForCategory) {
    grid.style.display = "none";
    grid.innerHTML = "";
    if (count) count.textContent = "";
    return;
  }
  grid.style.display = "";

  if (count) count.textContent = `${topState.filtered.length} piece${topState.filtered.length === 1 ? "" : "s"}`;

  if (!topState.filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>No top picks here yet</h3><p>Check back soon, or browse the full shop.</p></div>`;
    return;
  }
  grid.innerHTML = topState.filtered.map(productCardHTML).join("");
  bindProductCardButtons(grid);
}

document.addEventListener("DOMContentLoaded", initTopCollection);
