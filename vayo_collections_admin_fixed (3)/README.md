# Vayo Collection — E-commerce Website

A complete, **multi-page** online store for ornaments: full storefront
(shop, product pages, cart, checkout, wishlist, order tracking, user
profile, account login, FAQ/legal pages), a full admin panel (products,
categories, orders, customers, coupons, banners, reviews, reports,
settings), Firebase (Auth + Firestore + Storage) as the backend, and
Razorpay for payments verified through **Netlify Functions**.

No build step, no framework — plain HTML/CSS/JS, so the storefront
itself deploys anywhere that hosts static files. The two payment
functions are written for **Netlify** specifically (per the brief),
since that's where the Razorpay Key Secret needs to live.

```
vayo-collection/
├─ index.html                 ← Home (hero, promo banners, featured products, reviews)
├─ shop.html                  ← Full catalog — search, category filter, sort
├─ product.html                ← Product detail (?id=...), reviews, related products
├─ cart.html                    ← Full bag page with order summary
├─ checkout.html                 ← Shipping form, coupon field, Razorpay payment
├─ order-success.html             ← Thank-you / confirmation page
├─ profile.html                    ← My Profile — edit details & default address (NEW)
├─ wishlist.html                    ← Saved products
├─ orders.html                       ← "My Orders" order tracking
├─ faq.html                            ← FAQ accordion
├─ privacy-policy.html                  ← Privacy Policy
├─ terms.html                             ← Terms of Service
├─ about.html                               ← Our Story
├─ contact.html                               ← Contact form + shop info
├─ login.html                                   ← Shopper login / create account
├─ admin/
│   ├─ index.html         ← admin login
│   └─ dashboard.html     ← Overview · Products · Categories · Orders · Customers ·
│                            Coupons · Banners · Reviews · Reports · Settings
├─ css/
│   ├─ style.css          ← shared storefront styles (all pages)
│   └─ admin.css
├─ js/
│   ├─ firebase-config.js ← paste your Firebase keys here
│   ├─ brand.js            ← shop name, WhatsApp number
│   ├─ demo-data.js        ← sample products shown until you add real ones
│   ├─ store.js            ← shared: cart state, product loading, mini-cart drawer, nav
│   ├─ wishlist.js         ← shared: wishlist state (localStorage + Firestore sync)
│   ├─ wishlist-page.js    ← wishlist.html rendering
│   ├─ orders.js           ← orders.html "My Orders" + tracking
│   ├─ profile.js          ← profile.html — account details + address (NEW)
│   ├─ reviews.js          ← product page review submission + display
│   ├─ home.js             ← home page: featured products, promo banners
│   ├─ shop.js             ← shop page: filter / search / sort
│   ├─ product-detail.js   ← product page: gallery, add to bag, related items
│   ├─ cart-page.js        ← cart page rendering
│   ├─ checkout.js         ← shipping form, coupons, Razorpay checkout via Netlify Functions
│   ├─ customer-auth.js    ← shopper login state, nav account menu, login gate
│   ├─ login.js            ← login.html form logic (login / sign up, writes /users profile)
│   └─ admin.js            ← admin dashboard logic (all tabs)
├─ netlify/functions/
│   ├─ create-order.js     ← creates the Razorpay Order server-side (NEW)
│   └─ verify-payment.js   ← verifies signature + saves the order to Firestore (NEW)
├─ netlify.toml            ← functions directory + friendly /api/... routes (NEW)
├─ package.json            ← dependencies for the two functions (NEW)
├─ firestore.rules
└─ storage.rules
```

Every storefront page shares the same header, footer and a slide-in
mini-cart (via `js/store.js`), so the cart stays in sync as customers
move between pages — it's backed by `localStorage`, not just page state.

---

## 1. Create your Firebase project (free)

1. Go to **console.firebase.google.com** → **Add project** → name it
   "Vayo Collection" → follow the prompts (Google Analytics is optional).
2. Once created, click the **Web (`</>`)** icon to register a web app.
   Firebase will show you a `firebaseConfig` object — copy it.
3. Open **`js/firebase-config.js`** in this project and paste your values
   in place of the `YOUR_...` placeholders.

## 2. Turn on the services you need

In the Firebase console sidebar:

- **Authentication** → Sign-in method → enable **Email/Password**.
  Then go to the **Users** tab → **Add user** → create the shop owner's
  admin login (e.g. `owner@vayocollection.com` + a password). This is
  the account you'll use to log into `/admin` — **you must also add it
  to the `admins` collection**, see step 3.
- **Firestore Database** → Create database → start in **production mode**
  → pick a region close to India (e.g. `asia-south1`).
- **Storage** → Get started (used for product/category/banner/logo
  photo uploads from the admin panel).

## 3. Apply the security rules and create your admin account

- Firestore → **Rules** tab → paste the contents of `firestore.rules` →
  Publish.
- Storage → **Rules** tab → paste the contents of `storage.rules` →
  Publish.

**Important — this is what makes someone an "admin":** the storefront
and the admin panel share the same login system (Firebase
Authentication), so a plain shopper account and the shop owner's
account look identical to Firebase. What separates them is a document
in a Firestore collection called `admins`:

1. Firestore → **Data** tab → **Start collection** → collection ID
   `admins`.
2. **Document ID** → paste the admin user's **Auth UID** (find it in
   Authentication → Users, next to their email) → add any field, e.g.
   `role: "admin"` → Save.
3. Repeat for each additional staff member who should have admin
   access.

Without this document, that account can log into `/admin` but will be
immediately signed back out.

These rules let anyone browse products/categories/banners/reviews and
let a shopper read only their *own* orders/wishlist — but **no one can
write an order document from the browser at all**; see step 5 for why.
Every write to products, categories, coupons, banners, customers and
settings is reserved for admins only.

## 4. Get a Firebase Admin service account key (for the payment functions)

The `verify-payment` function needs to write the confirmed order to
Firestore itself, from the server — this uses the **Firebase Admin
SDK**, which needs its own credentials (separate from the public
`firebaseConfig` used by the browser):

1. Firebase console → ⚙️ **Project settings** → **Service accounts** tab.
2. Click **Generate new private key** → confirm → a `.json` file
   downloads.
3. Open that file, copy its *entire* contents (it's one JSON object).
   You'll paste this into a Netlify environment variable in step 6 —
   keep the file itself out of git.

## 5. Set up Razorpay

1. Create an account at **dashboard.razorpay.com**.
2. Complete KYC to accept live payments (you can test everything before
   KYC finishes using **Test Mode**).
3. Settings → **API Keys** → generate a key → copy both the **Key ID**
   and **Key Secret**.
4. Open **`js/checkout.js`** and replace `RAZORPAY_KEY_ID` with your
   Key ID — this one is safe in the browser by design.
5. The **Key Secret** goes only into Netlify's environment variables
   (step 6) — never into any HTML/JS file, Firestore document, or
   GitHub repo.

### How payment saving works here (per the brief)

1. `checkout.js` calls `POST /api/create-order` (→
   `netlify/functions/create-order.js`), which creates the Razorpay
   Order **server-side** using your Key ID + Key Secret from Netlify's
   environment — the total is recomputed there too, not just trusted
   from the browser.
2. Razorpay's checkout widget opens using that order ID.
3. On successful payment, `checkout.js` calls `POST /api/verify-payment`
   (→ `netlify/functions/verify-payment.js`) with the payment signature.
   That function verifies the signature with `crypto.createHmac` using
   your Key Secret — if it doesn't match, nothing is saved.
4. **Only once the signature is verified** does that same function
   write the order to Firestore, using the Firebase Admin SDK (a
   trusted server context, separate from `firestore.rules`, which is
   why the browser itself never creates an order document).
5. The browser gets back the new order's ID and redirects to
   `order-success.html`.

This means an order only ever exists in Firestore if Razorpay has
already confirmed the payment — nothing is written on a failed or
abandoned payment.

## 6. Deploy to Netlify

1. Push this folder to a GitHub repo, then **Add new site → Import an
   existing project** on app.netlify.com and connect the repo (build
   command: none needed, publish directory: `.`) — or drag-and-drop the
   folder at app.netlify.com/drop and add the functions afterwards via
   Netlify CLI.
2. Site settings → **Environment variables** → add:
   | Key | Value |
   |---|---|
   | `RAZORPAY_KEY_ID` | your Razorpay Key ID |
   | `RAZORPAY_KEY_SECRET` | your Razorpay Key Secret |
   | `FIREBASE_SERVICE_ACCOUNT_KEY` | the full JSON from step 4, pasted as one line |
3. Redeploy the site so the functions pick up the new environment
   variables. `netlify.toml` already points Netlify at
   `netlify/functions` and maps the friendly `/api/create-order` and
   `/api/verify-payment` paths used by `checkout.js`.
4. Test with Razorpay's test card `4111 1111 1111 1111`, any future
   expiry, any CVV, while your Key ID/Secret are still the `rzp_test_...`
   pair — switch to live keys once KYC is done and you're ready to
   accept real payments.

## 7. Add your branding

- `js/brand.js` — shop name, tagline, WhatsApp number.
- **Admin → Settings tab** — store name, tagline, notice-bar text,
  shipping rate, free-shipping threshold, and your Razorpay Key ID, all
  editable without touching code.
- **Admin → Banners tab** — upload homepage promo banners (image, title,
  link) — they show automatically on `index.html` under the marquee.
- **Admin → Categories tab** — manage the category list shown across the
  shop and used for filtering.
- Admin panel lets you add real products with real photos (stored in
  Firebase Storage under `products/`) — once you add even one product
  there, the placeholder demo products disappear automatically from
  every storefront page.

## 8. Customer accounts (required for bag / checkout / wishlist / reviews)

Shoppers must be logged in to add anything to their bag, checkout, save
a wishlist item, or submit a review — browsing the shop, product pages,
and searching all stay open to everyone.

- Clicking **Add to Bag**, **Buy Now**, or the wishlist heart while
  logged out sends the shopper to `login.html` and — for the bag —
  automatically adds the item the moment they log in or sign up.
- `checkout.html`, `orders.html` and `profile.html` also check login on
  their own.
- This uses the same **Authentication → Email/Password** provider from
  step 2 — shoppers create their own accounts from `login.html`
  (completely separate from admin access, see step 3).
- Signing up or logging in writes/updates a profile document in the
  `users` collection (name, email, timestamps) — this is what powers
  both **My Profile** (`profile.html`) and the **Admin → Customers**
  tab. From `profile.html`, a shopper can also save a default delivery
  address and request a password-reset email.
- Until you connect a real Firebase project, this runs in a **local
  demo mode**: any email/password "creates" a local login stored in
  the browser, so you can click through the whole flow before Firebase
  is wired up.

## 8b. What's new in the Fashion Admin Dashboard upgrade

The admin panel (`/admin`) now covers everything a shop owner needs to run
the storefront without touching code or redeploying:

- **Products** — multiple photos per product with click-to-reorder and a
  cover image, sale price (shown struck-through next to MRP), size/variant
  chips, Collection field, and Featured / New Arrival flags used by the
  homepage sections below.
- **Categories** — image upload, description, and a Display Order number
  that controls the order categories appear across the site.
- **Homepage Manager** (`#homepage`) — desktop + mobile hero images,
  heading, subtitle, button text/link, and a drag-free up/down reorder
  list to enable/disable and reorder homepage sections (Hero, Categories,
  Promo Banners, Featured Products, Instagram Feed, Facebook Highlights,
  etc.) — saved to `settings/homepage` and picked up live by `js/site-
  dynamic.js` on the storefront.
- **Instagram Manager** (`#instagram`) — add/edit/delete posts with an
  uploaded image or video, caption, the Instagram post URL, and an
  optional link to a product or collection; toggle visibility per post.
  Stored in the `instagramPosts` collection.
- **Facebook Manager** (`#facebook`) — same idea for promotional Facebook
  content (title + caption + media + link), stored in `facebookPosts`.
- **Social Media** (`#social`) — one place to manage Instagram, Facebook,
  WhatsApp, YouTube, Pinterest and one custom link, each with its own
  show/hide switch — drives the footer icons and the floating WhatsApp
  button everywhere on the site. Stored in `settings/social`.
- **Website Settings** — now also covers Logo and Favicon upload (applied
  everywhere the `.brand-logo` class is used, plus the browser tab icon),
  contact email/phone/address, on top of the existing store name,
  tagline and notice bar.
- **Overview** — extra stat cards (categories, customers, pending orders,
  live new-arrivals count) and a Quick Actions row, plus a dedicated
  Low Stock table.

All of it writes straight to Firestore/Storage from the browser (admin
writes are gated by `firestore.rules` / `storage.rules`, same as before),
so changes appear on the live storefront on the next page load — nothing
to redeploy. `js/site-dynamic.js` is the storefront-side piece that reads
`settings/homepage`, `settings/social`, `settings/website`, `instagram
Posts` and `facebookPosts` and applies them to `index.html` (hero,
section order/visibility, Instagram/Facebook strips) and to every other
page (logo, favicon, footer social icons, WhatsApp button).

## 9. Using the admin panel day to day

Visit `yoursite.com/admin` → sign in with an email/password that also
has an `admins/{uid}` document (see step 3).

- **Overview** — quick totals: products, orders, revenue, low-stock
  alerts.
- **Products** — Add/Edit/Delete, photo upload, stock (0 = auto
  "Sold Out").
- **Categories** — manage the categories shown in the shop filters and
  footer.
- **Orders** — every verified checkout appears here in real time;
  update status (Pending → Confirmed → Shipped → Delivered) — this is
  exactly what drives the tracker a shopper sees on `orders.html`.
- **Customers** — every shopper who's created an account, with their
  order count and total spend.
- **Coupons** — create percentage or flat-amount codes with an optional
  minimum order, usage cap and expiry date; shoppers apply them at
  checkout, and usage counts increment automatically after a verified
  payment.
- **Banners** — homepage promo images/links.
- **Reviews** — every review a shopper submits from a product page
  starts as "Pending"; approve it to make it public, or delete it.
- **Reports** — revenue/orders/AOV for the last 30 days, top-selling
  products, and an orders-by-status breakdown.
- **Settings** — store name/tagline/notice bar, shipping rate & free
  threshold, and Razorpay Key ID — all editable without redeploying.

## Notes & limits

- Free tier limits: Firebase's Spark (free) plan comfortably covers a
  small-to-medium shop (50K Firestore reads/day, 20K writes/day, 5GB
  Storage). Netlify's free tier includes 125K function invocations/month
  — plenty for most small shops.
- The storefront's shipping calculation (`shippingFor()` in
  `js/store.js`) is still the simple flat ₹79 / free-above-₹999 rule
  hardcoded in code — the Settings tab's shipping fields are saved to
  Firestore and ready to be wired in as the live source of truth if
  you'd like that connected next.
- `create-order.js` recomputes the order total from the item
  prices/quantities the browser sends, but doesn't currently re-look-up
  each product's *current* price from Firestore — for a small catalog
  this is usually fine, but if you want zero trust in the client, extend
  that function to fetch each product from Firestore (via the Admin
  SDK) before summing.
- COD (cash on delivery) isn't wired up — this build is prepaid-only via
  Razorpay.
- If you were running the previous version of this project (which
  created the Firestore order *before* payment and used Firebase Cloud
  Functions), this update replaces that with the Netlify Functions flow
  described above — the old `/functions` folder has been removed.
"# vayo-backend" 
