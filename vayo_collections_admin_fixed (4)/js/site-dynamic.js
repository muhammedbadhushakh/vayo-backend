/* =========================================================
   SITE-DYNAMIC.JS
   Pulls everything the Admin panel manages (Website Settings,
   Homepage Manager, Social Media, Instagram/Facebook Managers)
   straight from Firestore on every page load, so changes made
   in /admin show up on the live site instantly — no redeploy.
   Safe to include on every page; each block checks that its
   target elements exist before touching the DOM, and silently
   skips anything not present on the current page.
   ========================================================= */
(function () {
  if (typeof DEMO_MODE === "undefined" || DEMO_MODE) return;

  document.addEventListener("DOMContentLoaded", async () => {
    applyWebsiteSettings();
    applySocialLinks();
    applyHomepage(); // hero content + section show/hide/reorder (home page only)
    loadInstagramFeed();
    loadFacebookFeed();
  });

  /* ---------------- Website Settings (logo / favicon / name) ---------------- */
  async function applyWebsiteSettings() {
    try {
      const doc = await db.collection("settings").doc("website").get();
      if (!doc.exists) return;
      const d = doc.data();
      if (d.logo) {
        document.querySelectorAll(".brand-logo").forEach((img) => (img.src = d.logo));
      }
      if (d.favicon) {
        let link = document.querySelector('link[rel="icon"]');
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = d.favicon;
      }
    } catch (e) {
      /* settings not created yet — fine, defaults stay */
    }
  }

  /* ---------------- Social Media links ---------------- */
  async function applySocialLinks() {
    try {
      const doc = await db.collection("settings").doc("social").get();
      if (!doc.exists) return;
      const d = doc.data();

      const wire = (id, url, enabled) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!enabled || !url) {
          el.style.display = "none";
          return;
        }
        el.href = url;
        el.style.display = "";
      };
      wire("socialInstagram", d.instagramUrl, d.instagramEnabled);
      wire("socialFacebook", d.facebookUrl, d.facebookEnabled);
      wire("socialYoutube", d.youtubeUrl, d.youtubeEnabled);
      wire("socialPinterest", d.pinterestUrl, d.pinterestEnabled);
      wire("socialOther", d.otherUrl, d.otherEnabled);
      if (d.otherEnabled && d.otherUrl) {
        const otherEl = document.getElementById("socialOther");
        if (otherEl && d.otherLabel) otherEl.setAttribute("aria-label", d.otherLabel);
      }

      const waFloat = document.getElementById("whatsappFloat");
      const waFooter = document.getElementById("socialWhatsapp");
      if (d.whatsappNumber) {
        const digits = String(d.whatsappNumber).replace(/[^\d]/g, "");
        if (digits) {
          const link = `https://wa.me/${digits}`;
          if (waFloat) waFloat.href = link;
          if (waFooter) waFooter.href = link;
        }
      }
      if (waFloat) waFloat.style.display = d.whatsappEnabled === false ? "none" : "";
      if (waFooter) waFooter.style.display = d.whatsappEnabled === false ? "none" : "";
    } catch (e) {
      /* social settings not created yet — footer keeps its defaults */
    }
  }

  /* ---------------- Homepage Manager: hero + section order/visibility ---------------- */
  async function applyHomepage() {
    try {
      const doc = await db.collection("settings").doc("homepage").get();
      if (!doc.exists) return;
      const d = doc.data();

      const heading = document.getElementById("heroHeading");
      const subtitle = document.getElementById("heroSubtitle");
      const ctaBtn = document.getElementById("heroCtaBtn");
      const heroImg = document.getElementById("heroImg");

      if (heading && d.heading) heading.innerHTML = d.heading;
      if (subtitle && d.subtitle) subtitle.textContent = d.subtitle;
      if (ctaBtn && d.btnText) ctaBtn.textContent = d.btnText;
      if (ctaBtn && d.btnLink) ctaBtn.href = d.btnLink;
      if (heroImg) {
        const isMobile = window.matchMedia("(max-width:700px)").matches;
        const chosen = (isMobile && d.heroMobile) || d.heroDesktop;
        if (chosen) heroImg.src = chosen;
      }

      // Section id -> actual DOM container id present on index.html.
      const SECTION_DOM_MAP = {
        hero: "section-hero",
        categories: "ourCategories",
        promoBanners: "promoBanners",
        featured: "bestSellers",
        instagram: "instagramSection",
        facebook: "facebookSection",
      };

      if (Array.isArray(d.sections)) {
        let anchor = null;
        d.sections.forEach((s) => {
          const domId = SECTION_DOM_MAP[s.id];
          if (!domId) return; // section type has no container on this template — skip safely
          const el = document.getElementById(domId);
          if (!el) return;
          el.style.display = s.enabled === false ? "none" : "";
          if (s.enabled !== false) {
            // reorder: move this section right after the previous enabled one
            if (anchor) anchor.insertAdjacentElement("afterend", el);
            anchor = el;
          }
        });
      }
    } catch (e) {
      /* homepage doc not created yet — page keeps its default hero/order */
    }
  }

  /* ---------------- Instagram feed ---------------- */
  async function loadInstagramFeed() {
    const section = document.getElementById("instagramSection");
    const grid = document.getElementById("instagramFeedGrid");
    if (!section || !grid) return;
    try {
      const snap = await db.collection("instagramPosts").where("active", "==", true).limit(8).get();
      const posts = snap.docs.map((d) => d.data());
      if (!posts.length) {
        section.style.display = "none";
        return;
      }
      section.style.display = "";
      grid.innerHTML = posts
        .map((p) => {
          const media = p.mediaType === "video" ? `<video src="${p.mediaUrl || ""}" muted loop autoplay playsinline style="width:100%;height:180px;object-fit:cover;display:block"></video>` : `<img src="${p.mediaUrl || ""}" alt="" loading="lazy" style="width:100%;height:180px;object-fit:cover;display:block" onerror="this.parentElement.style.display='none'">`;
          const href = p.igUrl || linkFor(p);
          return `<a href="${href}" target="_blank" rel="noopener" style="display:block;border:1px solid var(--border-soft);overflow:hidden">${media}</a>`;
        })
        .join("");
    } catch (e) {
      /* instagramPosts collection not created yet — section stays hidden */
      section.style.display = "none";
    }
  }

  /* ---------------- Facebook highlights ---------------- */
  async function loadFacebookFeed() {
    const section = document.getElementById("facebookSection");
    const grid = document.getElementById("facebookFeedGrid");
    if (!section || !grid) return;
    try {
      const snap = await db.collection("facebookPosts").where("active", "==", true).limit(6).get();
      const posts = snap.docs.map((d) => d.data());
      if (!posts.length) {
        section.style.display = "none";
        return;
      }
      section.style.display = "";
      grid.innerHTML = posts
        .map((p) => {
          const media = p.mediaType === "video" ? `<video src="${p.mediaUrl || ""}" muted loop autoplay playsinline style="width:100%;height:200px;object-fit:cover;display:block"></video>` : `<img src="${p.mediaUrl || ""}" alt="" loading="lazy" style="width:100%;height:200px;object-fit:cover;display:block" onerror="this.style.display='none'">`;
          const href = p.fbUrl || linkFor(p);
          return `<a href="${href}" target="_blank" rel="noopener" style="display:block;border:1px solid var(--border-soft);overflow:hidden">
            ${media}
            <div style="padding:14px 16px">
              ${p.title ? `<b style="display:block;font-family:var(--serif);margin-bottom:4px">${p.title}</b>` : ""}
              ${p.caption ? `<span style="color:var(--muted);font-size:.82rem">${p.caption}</span>` : ""}
            </div>
          </a>`;
        })
        .join("");
    } catch (e) {
      /* facebookPosts collection not created yet — section stays hidden */
      section.style.display = "none";
    }
  }

  function linkFor(p) {
    if (p.linkType === "product" && p.linkValue) return `shop.html?search=${encodeURIComponent(p.linkValue)}`;
    if (p.linkType === "collection" && p.linkValue) return `shop.html?category=${encodeURIComponent(p.linkValue)}`;
    return "#";
  }
})();
