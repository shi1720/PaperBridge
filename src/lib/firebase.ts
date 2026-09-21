import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";
const env = import.meta.env;
export const configured = !!env.VITE_FIREBASE_API_KEY;
export const serviceReady =
  env.VITE_USE_EMULATORS === "true" || env.VITE_SERVICE_READY === "true";
export const googleAuthEnabled =
  env.VITE_USE_EMULATORS === "true" || env.VITE_GOOGLE_AUTH_ENABLED === "true";
export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || "demo-only",
  authDomain:
    env.VITE_FIREBASE_AUTH_DOMAIN || "paperbridge-research.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "paperbridge-research",
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET ||
    "paperbridge-research.firebasestorage.app",
  appId: env.VITE_FIREBASE_APP_ID || "demo-only",
});
export const auth = getAuth(app),
  functions = getFunctions(app, "us-central1"),
  storage = getStorage(app);
if (env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}
const endpoint = httpsCallable(functions, "api", { timeout: 540000 });
export async function serverCall(action: string, payload: object = {}) {
  const r = await endpoint({ action, ...payload });
  return (r.data as { data: any }).data;
}
