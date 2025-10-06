import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBNvc6hDV4khuUxu7TSuxqlZLAI4j52dUA",
  authDomain: "plazaapp-5e5b5.firebaseapp.com",
  projectId: "plazaapp-5e5b5",
  storageBucket: "plazaapp-5e5b5.firebasestorage.app",
  messagingSenderId: "572023972551",
  appId: "1:572023972551:web:0e07eb89dee332d28dd4e2",
  measurementId: "G-WHPGTSQBK5"
};


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app); 