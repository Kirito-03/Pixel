import { GoogleSignin } from '@react-native-google-signin/google-signin';

export async function googleSignInAndroid(webClientId: string) {
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
    forceCodeForRefreshToken: false,
  });

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result: any = await GoogleSignin.signIn();
  return { idToken: result?.data?.idToken || result?.idToken || '' };
}

export async function googleSignOutAndroid() {
  await GoogleSignin.signOut();
}

