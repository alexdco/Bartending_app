import { Suspense } from "react";
import { AuthCallbackClient } from "@/auth/auth-callback-client";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackClient />
    </Suspense>
  );
}
