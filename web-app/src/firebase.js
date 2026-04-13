import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY            || "demo",
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN        || "okada-online-ghana.firebaseapp.com",
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID         || "okada-online-ghana",
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET     || "okada-online-ghana.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID|| "000",
  appId:             process.env.REACT_APP_FIREBASE_APP_ID             || "demo",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export default app;
