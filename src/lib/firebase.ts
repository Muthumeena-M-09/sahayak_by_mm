import { getApps, initializeApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  inMemoryPersistence,
  type Auth,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

// Purge any legacy persisted Firebase IndexedDB / Web Storage entries so stale expired
// tokens never trigger automatic background STS refresh calls against securetoken.googleapis.com.
if (typeof window !== 'undefined') {
  try {
    window.indexedDB?.deleteDatabase('firebaseLocalStorageDb');
  } catch {
    // Ignore IndexedDB cleanup errors in restricted contexts
  }
  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      if (!storage) continue;
      for (let i = storage.length - 1; i >= 0; i--) {
        const k = storage.key(i);
        if (k && k.startsWith('firebase:')) {
          storage.removeItem(k);
        }
      }
    }
  } catch {
    // Ignore storage cleanup errors in restricted iframe contexts
  }
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

function createInMemoryAuth(): Auth {
  try {
    return initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createInMemoryAuth();
export const googleAuthProvider = new GoogleAuthProvider();
