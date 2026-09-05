import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { getAuth, type Auth } from 'firebase/auth'

// Firebase config is read from environment variables in production.
// The fallbacks and the Firebase CLI target intentionally use the same
// production project so an unset .env file cannot silently write elsewhere.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCyy3bGb5Bz5AizdT9zRqRZ1Jf01BH_Iko',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'supermarketpos-464da.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'supermarketpos-464da',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'supermarketpos-464da.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '926759395935',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:926759395935:web:cda5e0f46c22e41fa4f1ea',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-P2VPJWS07D',
}

export const app: FirebaseApp = initializeApp(firebaseConfig)

// Firestore is initialized with persistent local cache so the app keeps
// working (reads AND writes queued) while offline, across browser tabs.
export const db: Firestore = initializeFirestore(app, {
  // User-entered optional fields are often represented as `undefined` in
  // TypeScript. Firestore otherwise rejects the entire queued write.
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
})

export const auth: Auth = getAuth(app)
