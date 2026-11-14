import { Platform } from 'react-native'

let mod: any
if (Platform.OS === 'web') {
  mod = require('./firebase.web')
} else {
  try {
    mod = require('./firebase.native')
  } catch (_) {
    try {
      mod = require('./firebase.native.ts')
    } catch (_) {
      mod = require('./firebase.web')
    }
  }
}

export const app = mod.app
export const auth = mod.auth
export const db = mod.db
export const remoteConfig = mod.remoteConfig
export const storage = mod.storage
export const analytics = mod.analytics