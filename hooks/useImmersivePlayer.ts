import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

// Serialize entry/exit: a slow landscape request must never complete after
// the portrait restoration when the user closes a player quickly.
let orientationQueue = Promise.resolve();
function lock(lock: ScreenOrientation.OrientationLock) {
  orientationQueue = orientationQueue.then(() => ScreenOrientation.lockAsync(lock)).catch(() => {});
}

export function useImmersivePlayer() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    lock(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => lock(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);
}
