// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// The "Important Things" are safe right here:
const firebaseConfig = {
  apiKey: "AIzaSyD37a2yOhBIML4bQR85TwRpGg_tD1_NKts",
  authDomain: "appana-ai.firebaseapp.com",
  projectId: "appana-ai",
  storageBucket: "appana-ai.firebasestorage.app",
  messagingSenderId: "669104501358",
  appId: "1:669104501358:web:6be541f5ef72c33b312c7f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { app };
