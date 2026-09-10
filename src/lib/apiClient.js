'use client';

import { auth } from './firebase';

/**
 * Single entry point for every call the browser makes to /api/*.
 *
 * Every route now derives identity from a verified Firebase ID token, so the
 * client's job is simply to attach one. Nothing here sends a uid: the server
 * ignores client-supplied identity by design.
 */

export class ApiClientError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

/** Wait briefly for Firebase to restore the session on a cold page load. */
function currentUser(timeoutMs = 8000) {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new ApiClientError(401, 'You are signed out', 'Sign in again to continue.'));
    }, timeoutMs);
    const stop = auth.onAuthStateChanged((u) => {
      if (!u) return; // keep waiting until the timeout; a null here is "not restored yet"
      clearTimeout(timer);
      stop();
      resolve(u);
    });
  });
}

export async function apiFetch(path, options = {}) {
  const user = await currentUser();
  // getIdToken() refreshes automatically when the token is close to expiry.
  const token = await user.getIdToken();

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
    let payload = {};
    try { payload = await res.json(); } catch { /* non-JSON error body */ }
    throw new ApiClientError(res.status, payload.error || `Request failed (${res.status})`, payload.detail);
  }

  if (res.status === 204) return null;
  return res.json();
}

/**
 * Browser-side job id, matching the server's JOB_ID_PATTERN exactly.
 * Uses Web Crypto — the Node `crypto` module in src/lib/ids.js cannot be
 * imported into a client component.
 */
export function newJobId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return 'job_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Convenience wrapper for JSON POST/PATCH bodies. */
export function apiSend(path, method, body) {
  return apiFetch(path, { method, body: JSON.stringify(body) });
}
