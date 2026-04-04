import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// TODO: Replace with your actual Firebase config
// Get from: Firebase Console → Project Settings → Your Apps → Web app
const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY            || "YOUR_API_KEY",
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN        || "okada-online-ghana.firebaseapp.com",
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID         || "okada-online-ghana",
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET     || "okada-online-ghana.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID|| "YOUR_SENDER_ID",
  appId:             process.env.REACT_APP_FIREBASE_APP_ID             || "YOUR_APP_ID",
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
