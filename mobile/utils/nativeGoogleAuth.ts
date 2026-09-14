import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

export type NativeGoogleSignInResult =
  | { status: "success"; idToken: string; rawNonce: string }
  | { status: "cancelled" }
  | { status: "unavailable"; reason: string };

function createGoogleNonce(byteCount = 32): string {
  return Array.from(Crypto.getRandomBytes(byteCount))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Native Google Sign-In (Credential Manager account drawer) is only used on
 * Android development / production builds. Expo Go and other platforms keep
 * the existing browser OAuth path.
 */
export function canUseNativeGoogleSignIn(): boolean {
  if (Platform.OS !== "android") return false;
  if (Constants.appOwnership === "expo") return false;

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  return Boolean(webClientId);
}

export function getGoogleWebClientId(): string | null {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  return webClientId || null;
}

/**
 * Presents the Android Credential Manager Google account sheet and returns an
 * ID token for Supabase `signInWithIdToken`.
 */
export async function signInWithNativeGoogle(): Promise<NativeGoogleSignInResult> {
  const webClientId = getGoogleWebClientId();
  if (!webClientId) {
    return {
      status: "unavailable",
      reason: "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not configured",
    };
  }

  if (!canUseNativeGoogleSignIn()) {
    return {
      status: "unavailable",
      reason: "Native Google Sign-In is only available on Android builds",
    };
  }

  // Lazy-load so Expo Go / web never touch the Nitro native module.
  const {
    GoogleOneTapSignIn,
    isCancelledResponse,
    isErrorWithCode,
    isNoSavedCredentialFoundResponse,
    isSuccessResponse,
    statusCodes,
  } = require("react-native-nitro-google-signin") as typeof import("react-native-nitro-google-signin");

  const rawNonce = createGoogleNonce();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  GoogleOneTapSignIn.configure({
    webClientId,
    nonce: hashedNonce,
    // Prefer the account picker UI over silent auto-select.
    autoSelectOnSignIn: false,
  });

  try {
    await GoogleOneTapSignIn.checkPlayServices(true);

    // Credential Manager bottom sheet → create-account sheet → explicit picker.
    let response = await GoogleOneTapSignIn.signIn();
    if (isNoSavedCredentialFoundResponse(response)) {
      response = await GoogleOneTapSignIn.createAccount();
    }
    if (isNoSavedCredentialFoundResponse(response)) {
      response = await GoogleOneTapSignIn.presentExplicitSignIn();
    }

    if (isCancelledResponse(response)) {
      return { status: "cancelled" };
    }

    if (!isSuccessResponse(response) || !response.data.idToken) {
      return {
        status: "unavailable",
        reason: "Google did not return an identity token",
      };
    }

    return {
      status: "success",
      idToken: response.data.idToken,
      rawNonce,
    };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
      return { status: "cancelled" };
    }

    throw error;
  }
}
