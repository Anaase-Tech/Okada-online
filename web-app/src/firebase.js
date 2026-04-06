import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY || "demo",
  authDomain:        "okada-online-ghana.firebaseapp.com",
  projectId:         "okada-online-ghana",
  storageBucket:     "okada-online-ghana.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "000",
  appId:             process.env.REACT_APP_FIREBASE_APP_ID || "demo",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
