import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Real Okada Online Firebase project config. This is safe to commit —
// Firebase web config identifies the project, it is not a secret key.
// Actual access is controlled by Firestore/Auth security rules, not this.
const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY            || "AIzaSyCCj4c6XlrTniEgZ0tpU-QHcuOkqPU337c",
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN        || "okada-online-ghana.firebaseapp.com",
  databaseURL:       process.env.REACT_APP_FIREBASE_DATABASE_URL       || "https://okada-online-ghana-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID         || "okada-online-ghana",
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET     || "okada-online-ghana.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID|| "674920783969",
  appId:             process.env.REACT_APP_FIREBASE_APP_ID             || "1:674920783969:web:a7d155da86939893094a20",
  measurementId:     process.env.REACT_APP_FIREBASE_MEASUREMENT_ID     || "G-T9QK3SRMK1",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export default app;
