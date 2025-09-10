import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCNbzp8lDOdJpUWFBpjC-2bHYLemBj8cos",
  authDomain: "appecdriver.firebaseapp.com",
  databaseURL: "https://appecdriver-default-rtdb.firebaseio.com",
  projectId: "appecdriver",
  storageBucket: "appecdriver.appspot.com",
  messagingSenderId: "967992971623",
  appId: "1:967992971623:web:51dc3ba017676acdb0dfc2",
  measurementId: "G-PYJ7J08014"
};


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app); 