export async function googleSignInAndroid(webClientId: string): Promise<{ idToken: string, statusCodes: any }> {
  throw new Error('NOT_SUPPORTED_ON_THIS_PLATFORM');
}

export async function googleSignOutAndroid() {
  return;
}

