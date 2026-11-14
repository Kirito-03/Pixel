import { initializeApp } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getRemoteConfig } from 'firebase/remote-config'
import { getAnalytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY as string,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN as string,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID as string,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID as string,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID as string,
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
setPersistence(auth, browserLocalPersistence)

const db = initializeFirestore(app, { experimentalForceLongPolling: true })
const remoteConfig = getRemoteConfig(app)
const storage = getStorage(app)
// Analytics solo en web; si no está soportado o falta measurementId, quedará undefined
let analytics: ReturnType<typeof getAnalytics> | undefined
try {
  analytics = getAnalytics(app)
} catch (_) {
  analytics = undefined
}

export { app, auth, db, remoteConfig, storage, analytics }