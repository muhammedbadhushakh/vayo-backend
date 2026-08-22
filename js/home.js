/* =========================================================
   HOME PAGE — hero background slideshow
   Add more photos by dropping an <img> (wrapped the same way)
   inside #heroBg in index.html — this script picks them up
   automatically, no other changes needed.
   ========================================================= */
function initHeroSlideshow() {
  const bg = document.getElementById("heroBg");
  if (!bg) return;
  const slides = Array.from(bg.querySelectorAll(".hero-bg-slide"));
  if (slides.length < 2) return;

  let current = 0;
  const SLIDE_DURATION = 6000; // ms each photo stays fully visible before crossfading

  setInterval(() => {
    const next = (current + 1) % slides.length;

    // restart the zoom animation on the incoming slide
    const nextInner = slides[next].querySelector(".hero-bg-slide-inner");
    slides[next].classList.remove("active");
    void nextInner.offsetWidth; // force reflow so the animation replays
    slides[next].classList.add("active");

    slides[current].classList.remove("active");
    current = next;
  }, SLIDE_DURATION);
}
document.addEventListener("DOMContentLoaded", initHeroSlideshow);

/* =========================================================
   HOME PAGE — featured products strip
   ========================================================= */
async function loadFeaturedProducts() {
  const grid = document.getElementById("featuredGrid");
  if (!grid) return;
  grid.innerHTML = Array.from({ length: 4 })
    .map(() => `<div class="pcard"><div class="pcard-media skeleton"></div><div class="pcard-body"><div class="skeleton" style="height:14px;width:60%"></div><div class="skeleton" style="height:18px;width:80%;margin-top:8px"></div></div></div>`)
    .join("");

  const products = await loadAllProducts();
  const featured = products.filter((p) => p.badge);
  const list = (featured.length ? featured : products).slice(0, 4);

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>No pieces here yet</h3></div>`;
    return;
  }
  grid.innerHTML = list.map(productCardHTML).join("");
  bindProductCardButtons(grid);
}
document.addEventListener("DOMContentLoaded", loadFeaturedProducts);

/* =========================================================
   HOME PAGE — promo banners (from Admin -> Banners)
   ========================================================= */
async function loadPromoBanners() {
  const wrap = document.getElementById("promoBanners");
  if (!wrap || typeof DEMO_MODE === "undefined" || DEMO_MODE) return;
  try {
    const snap = await db.collection("banners").where("active", "==", true).get();
    const banners = snap.docs.map((d) => d.data());
    if (!banners.length) return;
    wrap.style.margin = "40px auto";
    wrap.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px">
      ${banners
        .map(
          (b) => `
        <a href="${b.link || "shop.html"}" style="position:relative;display:block;border:1px solid var(--border-soft);overflow:hidden">
          <img src="${b.image}" alt="${b.title || ""}" loading="lazy" decoding="async" style="width:100%;height:180px;object-fit:cover;display:block">
          ${b.title ? `<div style="position:absolute;bottom:0;left:0;right:0;padding:16px 20px;background:linear-gradient(to top,rgba(12,11,10,.85),transparent);color:var(--cream);font-family:var(--serif);font-size:1.05rem">${b.title}</div>` : ""}
        </a>`
        )
        .join("")}
    </div>`;
  } catch (e) {
    // banners collection may not exist yet — fine, just skip
  }
}
document.addEventListener("DOMContentLoaded", loadPromoBanners);
