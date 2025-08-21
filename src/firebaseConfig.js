import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAOfE_8hTnyXva2C223DiuPoe75RW9a4Wo",
  authDomain: "ecudriver-go.firebaseapp.com",
  projectId: "ecudriver-go",
  storageBucket: "ecudriver-go.firebasestorage.app",
  messagingSenderId: "215261563277",
  appId: "1:215261563277:web:ab73f014893a98413195c4",
  measurementId: "G-6LZ0VSQTKL"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app); 