import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

export const firebaseConfig = {
  apiKey: "AIzaSyDXPZnsLELoAb2yCnjnmx4-yDIBgOwH2ok",
  authDomain: "eduflow-c3f19.firebaseapp.com",
  projectId: "eduflow-c3f19",
  storageBucket: "eduflow-c3f19.firebasestorage.app",
  messagingSenderId: "145696752140",
  appId: "1:145696752140:web:48b30ecd2749b79bc56429",
  measurementId: "G-EZSD1SVP40"
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export default app
