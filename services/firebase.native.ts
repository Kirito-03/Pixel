import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getRemoteConfig } from 'firebase/remote-config'
import { getStorage } from 'firebase/storage'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { initializeAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

const app = initializeApp(firebaseConfig)
const getPersistence = () => {
  try {
    const mod = require('firebase/auth')
    return mod.getReactNativePersistence
      ? mod.getReactNativePersistence(AsyncStorage)
      : undefined
  } catch (_) {
    return undefined
  }
}

const persistence = getPersistence()
const auth = persistence ? initializeAuth(app, { persistence }) : initializeAuth(app)
const db = getFirestore(app)
const remoteConfig = getRemoteConfig(app)
const storage = getStorage(app)

export { app, auth, db, remoteConfig, storage }