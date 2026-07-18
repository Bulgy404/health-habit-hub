"use client";

import { signIn, useSession } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import { muiTheme } from "@/lib/mui-theme";
import { useIdleLogout } from "@/lib/useIdleLogout";

/**
 * Watches for a session token-refresh failure and re-triggers sign-in so the
 * user gets a fresh session rather than silently operating with a broken
 * token, and signs the admin out after 5 minutes of inactivity (see
 * useIdleLogout.ts) so an unattended session isn't left open indefinitely.
 */
function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  useIdleLogout();

  useEffect(() => {
    if ((session as { error?: string } | null)?.error === "RefreshAccessTokenError") {
      signIn("keycloak");
    }
  }, [session]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // The app is served under a base path (default /admin), so the NextAuth client
  // must target `<basePath>/api/auth` — otherwise signIn()/useSession()/CSRF fetch
  // the root `/api/auth/*`, which the reverse proxy routes to the backend API, not
  // the admin app. That breaks CSRF validation and sign-in silently loops.
  const authBasePath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? "/admin"}/api/auth`;
  return (
    <AppRouterCacheProvider options={{ key: "mui" }}>
      <ThemeProvider theme={muiTheme}>
        {/*
          Keycloak access tokens live ~5 min (realm default). Poll the session
          a bit sooner so NextAuth's jwt callback re-issues the access token
          before it expires, keeping session.accessToken valid for API calls
          without a manual page reload. refetchOnWindowFocus additionally
          recovers the moment the user returns to an idle tab.
        */}
        <SessionProvider
          basePath={authBasePath}
          refetchInterval={4 * 60}
          refetchOnWindowFocus
        >
          <SessionGuard>{children}</SessionGuard>
        </SessionProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
