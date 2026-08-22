/* =========================================================
   LOGIN / SIGNUP PAGE
   ========================================================= */

function buildRedirectURL() {
  const params = new URLSearchParams(location.search);
  const redirect = params.get("redirect") || "index.html";
  const pendingAdd = params.get("pendingAdd");
  const pendingQty = params.get("pendingQty");

  const target = new URL(redirect, location.href);
  if (pendingAdd) {
    target.searchParams.set("autoAdd", pendingAdd);
    target.searchParams.set("autoQty", pendingQty || "1");
  }
  return target.pathname.split("/").pop() + target.search;
}

function setAuthTab(which) {
  const isLogin = which === "login";
  document.getElementById("tabLogin").classList.toggle("active", isLogin);
  document.getElementById("tabSignup").classList.toggle("active", !isLogin);
  document.getElementById("loginForm").style.display = isLogin ? "block" : "none";
  document.getElementById("signupForm").style.display = isLogin ? "none" : "block";
}

function showAuthError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
}
function clearAuthError(id) {
  document.getElementById(id)?.classList.remove("show");
}

function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) return "An account already exists with that email — try logging in instead.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Incorrect email or password.";
  if (code.includes("weak-password")) return "Password should be at least 6 characters.";
  if (code.includes("invalid-email")) return "That email address doesn't look right.";
  return err?.message || "Something went wrong — please try again.";
}

async function handleLogin(e) {
  e.preventDefault();
  clearAuthError("loginError");
  const form = e.target;
  const email = form.email.value.trim();
  const password = form.password.value;
  const btn = document.getElementById("loginBtn");
  btn.disabled = true;
  btn.textContent = "Logging in…";

  try {
    if (customerAuthIsDemo()) {
      // Demo mode: any email/password combo "logs in" as that email.
      setDemoCustomer({ uid: "demo-" + btoa(email).slice(0, 12), name: email.split("@")[0], email });
    } else {
      const cred = await auth.signInWithEmailAndPassword(email, password);
      db.collection("users").doc(cred.user.uid).set({
        name: cred.user.displayName || email.split("@")[0],
        email,
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }).catch(() => {});
    }
    toast("Welcome back!");
    window.location.href = buildRedirectURL();
  } catch (err) {
    showAuthError("loginError", friendlyAuthError(err));
    btn.disabled = false;
    btn.textContent = "Login";
  }
}

async function handleSignup(e) {
  e.preventDefault();
  clearAuthError("signupError");
  const form = e.target;
  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  const btn = document.getElementById("signupBtn");
  btn.disabled = true;
  btn.textContent = "Creating account…";

  try {
    if (customerAuthIsDemo()) {
      setDemoCustomer({ uid: "demo-" + btoa(email).slice(0, 12), name, email });
    } else {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      await db.collection("users").doc(cred.user.uid).set({
        name,
        email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }).catch(() => {});
    }
    toast("Account created!");
    window.location.href = buildRedirectURL();
  } catch (err) {
    showAuthError("signupError", friendlyAuthError(err));
    btn.disabled = false;
    btn.textContent = "Create Account";
  }
}

function initLoginPage() {
  if (customerAuthIsDemo()) {
    document.getElementById("demoNotice").style.display = "block";
  }
  // Already logged in? Skip straight to where they were headed.
  if (isCustomerLoggedIn()) {
    window.location.href = buildRedirectURL();
    return;
  }

  const params = new URLSearchParams(location.search);
  setAuthTab(params.get("pendingAdd") || params.get("mode") === "signup" ? "login" : "login");

  document.getElementById("tabLogin").addEventListener("click", () => setAuthTab("login"));
  document.getElementById("tabSignup").addEventListener("click", () => setAuthTab("signup"));
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("signupForm").addEventListener("submit", handleSignup);
}

document.addEventListener("DOMContentLoaded", initLoginPage);
