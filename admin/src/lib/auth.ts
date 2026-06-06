import type { AuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { OAuthConfig } from "next-auth/providers/oauth";

declare module "next-auth" {
  interface Session {
    roles: string[];
    accessToken: string;
    error?: "RefreshAccessTokenError";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roles: string[];
    accessToken?: string;
    accessTokenExpires?: number;
    refreshToken?: string;
    error?: "RefreshAccessTokenError";
  }
}

const KEYCLOAK_INTERNAL = process.env.KEYCLOAK_INTERNAL_URL!;
const TOKEN_URL = `${KEYCLOAK_INTERNAL}/realms/hhh/protocol/openid-connect/token`;

/**
 * Exchange a refresh token for a new access token and return updated JWT fields.
 * On failure, marks the token with an error so the session callback can signal
 * the client to re-authenticate.
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
        refresh_token: token.refreshToken!,
      }),
    });

    if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);

    const refreshed = await res.json() as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
      realm_access?: { roles?: string[] };
    };

    return {
      ...token,
      accessToken: refreshed.access_token,
      // expires_in is relative seconds; store as absolute Unix timestamp
      accessTokenExpires: Math.floor(Date.now() / 1000) + refreshed.expires_in,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      // Update roles from the new token so revocations take effect on refresh
      roles: refreshed.realm_access?.roles ?? token.roles,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

/**
 * NextAuth configuration object with Keycloak OAuth provider.
 * Extracts Keycloak realm roles and the access token into the session.
 * Refreshes the access token when it expires, updating roles on each refresh
 * so that role revocations in Keycloak take effect within one token TTL.
 */
export const authOptions: AuthOptions = {
  providers: [
    {
      id: "keycloak",
      name: "Keycloak",
      type: "oauth",
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
      wellKnown: `${process.env.KEYCLOAK_INTERNAL_URL!}/realms/hhh/.well-known/openid-configuration`,
      checks: ["pkce", "state"],
      idToken: true,
      authorization: {
        url: `${process.env.KEYCLOAK_BROWSER_URL!}/realms/hhh/protocol/openid-connect/auth`,
        params: { scope: "openid email profile" },
      },
      token: `${process.env.KEYCLOAK_INTERNAL_URL!}/realms/hhh/protocol/openid-connect/token`,
      userinfo: `${process.env.KEYCLOAK_INTERNAL_URL!}/realms/hhh/protocol/openid-connect/userinfo`,
      profile(profile) {
        return {
          id: String(profile.sub),
          name: (profile.name as string | undefined) ?? null,
          email: (profile.email as string | undefined) ?? null,
          image: null,
        };
      },
    } as OAuthConfig<Record<string, unknown>>,
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        // Initial sign-in: seed the token from the ID token profile.
        return {
          ...token,
          roles: (profile as { realm_access?: { roles?: string[] } }).realm_access?.roles ?? [],
          accessToken: account.access_token,
          accessTokenExpires: account.expires_at,
          refreshToken: account.refresh_token,
        };
      }

      // Access token still valid — return as-is.
      if (Date.now() / 1000 < (token.accessTokenExpires ?? 0)) {
        return token;
      }

      // Access token expired — refresh it. Roles are re-read from the new
      // token so that Keycloak role changes take effect within one TTL window.
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.roles = token.roles ?? [];
      session.accessToken = token.accessToken ?? "";
      if (token.error) session.error = token.error;
      return session;
    },
  },
};
