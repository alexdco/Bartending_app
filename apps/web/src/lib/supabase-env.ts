function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_ANON_KEY = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

// Shared cookie options for every Supabase cookie written in this app.
// httpOnly stays false deliberately: the browser client reads these same
// cookies via document.cookie, which every existing "use client" call site
// depends on; secure is relaxed outside production so local http dev still
// works; sameSite "lax" keeps the cookie attached across the
// auth-callback-client.tsx redirect (email confirm, password reset, email
// change), which is a same site top level navigation.
export const SUPABASE_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
