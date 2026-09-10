import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp;

export function getAdminApp() {
  if (adminApp) return adminApp;

  const existing = getApps();
  if (existing.length > 0) {
    adminApp = existing[0];
    return adminApp;
  }

  try {
    // On Cloud Run: uses the service account automatically
    // Locally: uses GOOGLE_APPLICATION_CREDENTIALS env var or gcloud auth
    adminApp = initializeApp({
      credential: applicationDefault(),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'super-blast-497610',
    });
  } catch (err) {
    console.warn('Firebase Admin init with applicationDefault failed, trying without credential:', err.message);
    // Fallback: init without explicit credential (works on GCP with metadata server)
    adminApp = initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'super-blast-497610',
    });
  }

  return adminApp;
}

/**
 * Get Firestore Admin instance (server-side)
 */
export function getAdminFirestore() {
  const app = getAdminApp();
  return getFirestore(app);
}
