// createAsyncStoragePersister's `storage` option expects getItem/setItem/
// removeItem returning promise-compatible values, while localStorage's
// methods are synchronous; this adapter wraps each call to resolve/reject
// correctly, guards every access against `typeof window === "undefined"`
// (no window exists during Next.js server rendering), and wraps in try/catch
// for private-browsing or storage-quota failures (localStorage throws rather
// than silently failing, unlike AsyncStorage). See spec
// 0023-quick-build-mode.md's Cross child contract / value sourcing table.
export const webLocalStoragePersisterAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Best effort; a full quota or private-browsing restriction means this
      // session simply won't persist offline data, not a crash.
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Best effort, see setItem above.
    }
  },
};
