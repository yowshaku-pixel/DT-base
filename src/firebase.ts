import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);

// Initialize Firestore with the specific database ID from the config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Enable offline persistence for better performance and reduced reads
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
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
  if (errorMessage.includes('Quota limit exceeded') || errorMessage.includes('quota exceeded')) {
    throw new Error(JSON.stringify({
      ...errInfo,
      userMessage: "Daily free database limit reached. Access will be restored tomorrow. Please check back then."
    }));
  }

  throw new Error(JSON.stringify(errInfo));
}

export function getFirestoreErrorMessage(error: any): string {
  try {
    const parsed = JSON.parse(error.message);
    if (parsed.userMessage) return parsed.userMessage;
    if (parsed.error.includes('Missing or insufficient permissions')) {
      return "You don't have permission to perform this action.";
    }
    return `Database error: ${parsed.error}`;
  } catch {
    return error.message || "An unexpected database error occurred.";
  }
}
