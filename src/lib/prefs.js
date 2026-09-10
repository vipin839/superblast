'use client';

import { useSyncExternalStore } from 'react';

/**
 * localStorage exposed as a React external store.
 *
 * Reading browser storage with `useEffect(() => setState(...), [])` triggers a
 * cascading render on every mount and is flagged by react-hooks/set-state-in-effect.
 * useSyncExternalStore is the supported way to subscribe to a non-React source:
 * it gives a server snapshot for SSR and re-renders only when the value changes.
 */

const listeners = new Set();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  // `storage` fires for changes made in *other* tabs; notify() covers this one.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function readPref(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback; // private mode, or site data blocked
  }
}

export function writePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* nothing persists, but the UI still updates for this session */
  }
  notify();
}

export function removePref(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  notify();
}

/** Subscribe to a single string preference. `fallback` is also the SSR snapshot. */
export function usePref(key, fallback = null) {
  return useSyncExternalStore(
    subscribe,
    () => readPref(key, fallback),
    () => fallback,
  );
}

const noopSubscribe = () => () => {};

/** True only after hydration — for code that must touch `document`. */
export function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
