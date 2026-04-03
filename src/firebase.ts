import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);

// Initialize Firestore with the specific database ID from the config
console.log("[DEBUG] Initializing Firestore with databaseId:", firebaseConfig.firestoreDatabaseId);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
console.log("[DEBUG] Firestore initialized:", db.type);

// Enable offline persistence for better performance and reduced reads
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).then(() => {
    console.log("[DEBUG] Firestore persistence enabled");
  }).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("Firestore persistence failed: Multiple tabs open.");
    } else if (err.code === 'unimplemented') {
      console.warn("Firestore persistence failed: Browser not supported.");
    }
  });
}

// Initialize Auth
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(err => console.error("Auth persistence error:", err));

export const googleProvider = new GoogleAuthProvider();

// Auth helpers
export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const loginWithGoogleRedirect = () => signInWithRedirect(auth, googleProvider);
export const logout = () => signOut(auth);

// Error handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // If it's a quota error, we might want to throw a more descriptive error for the UI to catch
  if (errorMessage.includes('Quota limit exceeded') || errorMessage.includes('quota exceeded') || error instanceof Error && (error as any).code === 'resource-exhausted') {
    throw new Error(JSON.stringify({
      ...errInfo,
      userMessage: "Daily free database limit reached. This happens on the free plan if you have many records or open the app frequently. Access will reset at midnight Pacific Time."
    }));
  }

  throw new Error(JSON.stringify(errInfo));
}

export function getFirestoreErrorMessage(error: any): string {
  if (error?.code === 'resource-exhausted') {
    return "Daily free database limit reached. This happens on the free plan if you have many records or open the app frequently. Access will reset at midnight Pacific Time.";
  }
  try {
    const parsed = JSON.parse(error.message);
    if (parsed.userMessage) return parsed.userMessage;
    if (parsed.error.includes('Missing or insufficient permissions')) {
      return "You don't have permission to perform this action.";
    }
    return `Database error: ${parsed.error}`;
  } catch {
    const msg = error.message || String(error);
    if (msg.includes('quota exceeded') || msg.includes('Quota limit exceeded')) {
      return "Daily free database limit reached. This happens on the free plan if you have many records or open the app frequently. Access will reset at midnight Pacific Time.";
    }
    return msg || "An unexpected database error occurred.";
  }
}
