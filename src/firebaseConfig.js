import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDdWqe-e5tMMLYhseb8ozy9BC6EeWn0L9w",
  authDomain: "ikonic-7f09a.firebaseapp.com",
  projectId: "ikonic-7f09a",
  storageBucket: "ikonic-7f09a.firebasestorage.app",
  messagingSenderId: "737991764243",
  appId: "1:737991764243:web:06838ca72e5f6c192892e6",
  measurementId: "G-NSQ294QH3M"
};



const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app); 