"use client";

import { signIn, useSession } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";

/**
 * Watches for a session token-refresh failure and re-triggers sign-in so the
 * user gets a fresh session rather than silently operating with a broken token.
 */
function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  useEffect(() => {
    if ((session as { error?: string } | null)?.error === "RefreshAccessTokenError") {
      signIn("keycloak");
    }
  }, [session]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionGuard>{children}</SessionGuard>
    </SessionProvider>
  );
}
