import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider, OAuthProvider, onAuthStateChanged, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase (Safely)
let app: any = null;
let auth: any = null;
let db: any = null;
let googleProvider: any = null;
let microsoftProvider: any = null;
let appCheck: any = null;

if (firebaseConfig.apiKey) {
  app = initializeApp(firebaseConfig);
  
  // Initialize App Check with reCAPTCHA v3
  if (typeof window !== 'undefined') {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider('6LfkNwItAAAAAIhHhZkzZ7raWAUKpsRyM4oiMYex'),
      isTokenAutoRefreshEnabled: true
    });
  }

  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
  microsoftProvider = new OAuthProvider('microsoft.com');
  microsoftProvider.addScope('email');
  microsoftProvider.addScope('profile');

  // Enable offline persistence (Fjäll-läge)
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
      console.warn('Multiple tabs open, offline mode enabled in only one tab at a time.');
    } else if (err.code == 'unimplemented') {
      console.warn('The current browser does not support all of the features required to enable persistence.');
    }
  });
} else {
  console.warn('FIREBASE MISSING: Skapa ditt projekt och lägg in nycklar i .env');
}

export { app, auth, db, googleProvider, microsoftProvider, appCheck, onAuthStateChanged, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink };
