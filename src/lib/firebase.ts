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
if (env.VITE_FIREBASE_AUTH_TENANT_ID)
  auth.tenantId = env.VITE_FIREBASE_AUTH_TENANT_ID;
const endpoint = httpsCallable(
  functions,
  env.VITE_API_FUNCTION_NAME || "paperbridgeApi",
  { timeout: 540000 },
);
export async function serverCall(action: string, payload: object = {}) {
  const r = await endpoint({ action, ...payload });
  return (r.data as { data: any }).data;
}

export async function uploadManuscript(
  file: File,
  paperId: string,
  onProgress?: (percent: number) => void,
): Promise<{
  id: string;
  storagePath: string;
  fileName: string;
  size: number;
}> {
  if (!auth.currentUser)
    throw new Error("Sign in before uploading a manuscript.");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Choose a PDF no larger than 20 MiB.");
  const token = await auth.currentUser.getIdToken();
  const functionName =
    env.VITE_UPLOAD_FUNCTION_NAME || "paperbridgeUploadManuscript";
  const projectId = app.options.projectId;
  const base =
    env.VITE_UPLOAD_URL ||
    (env.VITE_USE_EMULATORS === "true"
      ? `http://127.0.0.1:5001/${projectId}/us-central1/${functionName}`
      : `https://us-central1-${projectId}.cloudfunctions.net/${functionName}`);
  const url = new URL(base);
  url.searchParams.set("paperId", paperId);
  url.searchParams.set("fileName", file.name);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.timeout = 120000;
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader("Content-Type", "application/pdf");
    request.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    request.onerror = () =>
      reject(
        new Error("The PDF upload lost its connection. Please try again."),
      );
    request.ontimeout = () =>
      reject(new Error("The PDF upload timed out. Please try again."));
    request.onload = () => {
      let result;
      try {
        result = JSON.parse(request.responseText);
      } catch {
        reject(new Error("The upload server returned an invalid response."));
        return;
      }
      if (
        request.status >= 200 &&
        request.status < 300 &&
        result?.data?.storagePath
      )
        resolve(result.data);
      else
        reject(
          new Error(
            result?.error?.message ||
              "The PDF could not be uploaded. Please try again.",
          ),
        );
    };
    request.send(file);
  });
}

export const MEDIA_LIMITS = {
  avatar: 5 * 1024 * 1024,
  image: 8 * 1024 * 1024,
  pdf: 20 * 1024 * 1024,
  count: 4,
};
export function validateMediaFile(
  file: Pick<File, "type" | "size">,
  purpose: "avatar" | "community",
) {
  const image = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (!image && !(purpose === "community" && file.type === "application/pdf"))
    throw new Error(
      purpose === "avatar"
        ? "Choose a JPEG, PNG, or WebP image."
        : "Choose a JPEG, PNG, WebP image, or PDF.",
    );
  const max =
    purpose === "avatar"
      ? MEDIA_LIMITS.avatar
      : image
        ? MEDIA_LIMITS.image
        : MEDIA_LIMITS.pdf;
  if (!file.size || file.size > max)
    throw new Error(
      `Choose a ${image ? "photo" : "PDF"} between 1 byte and ${max / 1024 / 1024} MiB.`,
    );
}
export async function uploadMedia(
  file: File,
  purpose: "avatar" | "community",
  onProgress?: (percent: number) => void,
): Promise<import("./types").MediaAsset> {
  validateMediaFile(file, purpose);
  if (!auth.currentUser)
    throw new Error("Sign in with a real account to upload files.");
  const token = await auth.currentUser.getIdToken();
  const functionName =
    env.VITE_MEDIA_UPLOAD_FUNCTION_NAME || "paperbridgeUploadMedia";
  const projectId = app.options.projectId;
  const base =
    env.VITE_MEDIA_UPLOAD_URL ||
    (env.VITE_USE_EMULATORS === "true"
      ? `http://127.0.0.1:5001/${projectId}/us-central1/${functionName}`
      : `https://us-central1-${projectId}.cloudfunctions.net/${functionName}`);
  const url = new URL(base);
  url.searchParams.set("purpose", purpose);
  url.searchParams.set("fileName", file.name);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 120000;
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () =>
      reject(
        new Error("Upload interrupted. Check your connection and try again."),
      );
    xhr.ontimeout = () =>
      reject(new Error("Upload timed out. Please try again."));
    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && result?.data?.id)
          resolve(result.data);
        else
          reject(
            new Error(
              result?.error?.message || "This file could not be uploaded.",
            ),
          );
      } catch {
        reject(new Error("The upload server returned an invalid response."));
      }
    };
    xhr.send(file);
  });
}
