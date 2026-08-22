/* =========================================================
   PROFILE PAGE — profile.html
   ========================================================= */
async function initProfilePage() {
  const form = document.getElementById("profileForm");
  if (!form) return;

  if (typeof window.customerAuthReadyPromise !== "undefined") await window.customerAuthReadyPromise;
  const customer = typeof getCurrentCustomer === "function" ? getCurrentCustomer() : null;
  if (!customer) {
    if (typeof toast === "function") toast("Please login to view your profile", true);
    setTimeout(() => { window.location.href = "login.html?redirect=profile.html"; }, 500);
    return;
  }

  form.email.value = customer.email || "";
  form.name.value = customer.name || "";

  if (typeof DEMO_MODE === "undefined" || !DEMO_MODE) {
    try {
      const doc = await db.collection("users").doc(customer.uid).get();
      if (doc.exists) {
        const data = doc.data();
        if (data.phone) form.phone.value = data.phone;
        const addrForm = document.getElementById("addressForm");
        if (data.address && addrForm) {
          addrForm.address.value = data.address.address || "";
          addrForm.city.value = data.address.city || "";
          addrForm.state.value = data.address.state || "";
          addrForm.pincode.value = data.address.pincode || "";
        }
      }
    } catch (e) {
      console.warn("Couldn't load profile:", e.message);
    }
  }

  form.addEventListener("submit", handleProfileSave);
  document.getElementById("addressForm")?.addEventListener("submit", handleAddressSave);
  document.getElementById("resetPasswordBtn")?.addEventListener("click", handlePasswordReset);
}

async function handleProfileSave(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById("profileSaveBtn");
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();

  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    if (typeof DEMO_MODE !== "undefined" && DEMO_MODE) {
      toast("Connect Firebase to save real profile changes");
    } else {
      const customer = getCurrentCustomer();
      await auth.currentUser.updateProfile({ displayName: name });
      await db.collection("users").doc(customer.uid).set({ name, phone, email: customer.email }, { merge: true });
      toast("Profile updated");
    }
  } catch (err) {
    toast("Error saving profile: " + err.message, true);
  }
  btn.disabled = false;
  btn.textContent = "Save Changes";
}

async function handleAddressSave(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById("addressSaveBtn");
  const address = {
    address: form.address.value.trim(),
    city: form.city.value.trim(),
    state: form.state.value.trim(),
    pincode: form.pincode.value.trim(),
  };

  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    if (typeof DEMO_MODE !== "undefined" && DEMO_MODE) {
      toast("Connect Firebase to save a real address");
    } else {
      const customer = getCurrentCustomer();
      await db.collection("users").doc(customer.uid).set({ address }, { merge: true });
      toast("Address saved");
    }
  } catch (err) {
    toast("Error saving address: " + err.message, true);
  }
  btn.disabled = false;
  btn.textContent = "Save Address";
}

async function handlePasswordReset() {
  const btn = document.getElementById("resetPasswordBtn");
  const customer = getCurrentCustomer();
  if (!customer?.email) return;

  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    if (typeof DEMO_MODE !== "undefined" && DEMO_MODE) {
      toast("Connect Firebase to send real reset emails");
    } else {
      await auth.sendPasswordResetEmail(customer.email);
      toast("Reset link sent to " + customer.email);
    }
  } catch (err) {
    toast("Error sending reset link: " + err.message, true);
  }
  btn.disabled = false;
  btn.textContent = "Send Reset Link";
}

document.addEventListener("DOMContentLoaded", initProfilePage);
