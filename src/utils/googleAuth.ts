import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  signOut,
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Workspace Drive and Sheets scopes for uploading files and syncing meal logs
provider.addScope('https://www.googleapis.com/auth/drive');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.addScope('https://www.googleapis.com/auth/spreadsheets');

// Keys for storing access token across reloads and meal logs
const STORAGE_TOKEN_KEY = 'nutrihealth_google_drive_access_token_v1';
const STORAGE_TOKEN_EXPIRY = 'nutrihealth_google_drive_token_expires_at';

// In-memory token cache backed by browser storage
let cachedAccessToken: string | null = null;
let isSigningIn = false;

/**
 * Saves access token to memory and browser storage with a 2-hour sliding expiration window
 */
export const saveToken = (token: string) => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
      sessionStorage.setItem(STORAGE_TOKEN_KEY, token);
      // Store expiration time (55 minutes from now)
      const expiresAt = Date.now() + 55 * 60 * 1000;
      localStorage.setItem(STORAGE_TOKEN_EXPIRY, expiresAt.toString());
    } catch (e) {
      console.warn('Could not persist token to storage:', e);
    }
  }
};

/**
 * Loads token from memory or browser storage if still valid
 */
export const loadSavedToken = (): string | null => {
  if (cachedAccessToken) return cachedAccessToken;
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_TOKEN_KEY) || sessionStorage.getItem(STORAGE_TOKEN_KEY);
      const expiry = localStorage.getItem(STORAGE_TOKEN_EXPIRY);
      if (stored) {
        if (expiry) {
          const expiresAt = parseInt(expiry, 10);
          // If token has not expired
          if (Date.now() < expiresAt) {
            cachedAccessToken = stored;
            return stored;
          } else {
            // Expired, clear it
            clearSavedToken();
            return null;
          }
        }
        cachedAccessToken = stored;
        return stored;
      }
    } catch (e) {
      console.warn('Could not read token from storage:', e);
    }
  }
  return null;
};

/**
 * Completely clears token from memory and persistent storage
 */
export const clearSavedToken = () => {
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      sessionStorage.removeItem(STORAGE_TOKEN_KEY);
      localStorage.removeItem(STORAGE_TOKEN_EXPIRY);
    } catch (e) {
      // ignore
    }
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = loadSavedToken();
      if (token) {
        cachedAccessToken = token;
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        // User is authenticated with Firebase, but our Google Drive access token is expired or missing.
        // We will attempt to silently refresh it or prompt them, but for now we must clear the user state
        // because we don't have Drive access.
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      clearSavedToken();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No access token returned from Google Auth. Please ensure Drive permissions were granted.');
    }

    saveToken(credential.accessToken);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    // Gracefully handle user closing or cancelling the sign-in popup without error logging
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request' ||
      error?.message?.includes('auth/popup-closed-by-user') ||
      error?.message?.includes('cancelled-popup-request')
    ) {
      return null;
    }

    if (error?.code === 'auth/popup-blocked') {
      const enhancedError = new Error(
        'Popup window blocked by browser. Please click the Sign In button directly or open the app in a new tab.'
      );
      (enhancedError as any).code = 'auth/popup-blocked';
      throw enhancedError;
    }
    
    console.warn('Google Sign In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return loadSavedToken();
};

export const isGoogleDriveAuthorized = (): boolean => {
  return !!loadSavedToken();
};

export const googleSignOut = async () => {
  try {
    await signOut(auth);
    clearSavedToken();
  } catch (error) {
    console.warn('Sign out error:', error);
  }
};


