/* =========================================================
   FIREBASE CONFIG
   -----------------------------------------------------------
   1. Go to https://console.firebase.google.com -> Add project
   2. Project settings -> General -> "Your apps" -> Web app (</>)
   3. Copy the firebaseConfig object Firebase gives you and
      paste the values below, replacing the placeholders.
   4. In the Firebase console enable:
        - Authentication -> Sign-in method -> Email/Password
        - Firestore Database -> Create database (production mode)
        - Storage -> Get started
   5. See README.md in this project for full setup steps,
      including the Firestore security rules to paste in.
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyCF5Uf84byXNbq8HEqh3Dc3YSK-_1M1Jc4",
  authDomain: "vayodemo.firebaseapp.com",
  projectId: "vayodemo",
  storageBucket: "vayodemo.firebasestorage.app",
  messagingSenderId: "465750315301",
  appId: "1:465750315301:web:eaac32325c486cbaaf8acc"
};

// Initialize (Firebase v10 compat build is loaded via <script> tags in the HTML)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

// Some networks (school/office Wi-Fi, VPNs, antivirus HTTPS-scanning) let
// Firestore's initial handshake through (so Network tab shows 200s) but
// then silently break the streamed long-polling connection, so reads
// never actually resolve — the page just hangs on "Loading…" forever
// with no console error. Forcing plain long-polling instead of
// auto-detecting works around this. Safe to leave on permanently.
db.settings({
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});

// Set to true only while wiring things up without a real Firebase project yet.
// Automatically flips to false once a real apiKey is detected.
const DEMO_MODE = firebaseConfig.apiKey === "YOUR_API_KEY";
