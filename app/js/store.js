// Small wrapper around localStorage. Every access is guarded: storage can be
// unavailable (private mode, quota) and the app must keep working without it.
const PREFIX = 'douloo.';

export function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
