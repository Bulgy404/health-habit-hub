import type { AuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { OAuthConfig } from "next-auth/providers/oauth";

declare module "next-auth" {
  interface Session {
    roles: string[];
    accessToken: string;
    idToken?: string;
    error?: "RefreshAccessTokenError";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roles: string[];
    accessToken?: string;
    accessTokenExpires?: number;
    refreshToken?: string;
    idToken?: string;
    error?: "RefreshAccessTokenError";
  }
}

const KEYCLOAK_INTERNAL = process.env.KEYCLOAK_INTERNAL_URL!;
const TOKEN_URL = `${KEYCLOAK_INTERNAL}/realms/hhh/protocol/openid-connect/token`;

/**
 * Decode realm roles from a Keycloak access token (JWT).
 * Keycloak puts realm_access.roles in the access token payload, not in the
 * HTTP response body and not reliably in the ID token (which varies by mapper
 * configuration). Reading directly from the JWT avoids Issuer discovery
 * dependencies and works regardless of idToken mapper settings.
 */
function decodeRoles(accessToken?: string): string[] {
  if (!accessToken) return [];
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString()) as {
      realm_access?: { roles?: string[] };
    };
    return payload?.realm_access?.roles ?? [];
  } catch {
    return [];
  }
}

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

    const refreshed = (await res.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
      id_token?: string;
    };

    return {
      ...token,
      accessToken: refreshed.access_token,
      // expires_in is relative seconds; store as absolute Unix timestamp
      accessTokenExpires: Math.floor(Date.now() / 1000) + refreshed.expires_in,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      idToken: refreshed.id_token ?? token.idToken,
      // Re-decode roles from the new access token so revocations take effect.
      // realm_access is in the JWT payload, not the HTTP response body.
      roles: decodeRoles(refreshed.access_token),
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
      // wellKnown is intentionally omitted: when set, next-auth uses Issuer.discover() on the
      // internal Docker URL, and the returned discovery doc overrides authorization.url with
      // keycloak:8080 (unreachable from the browser). All endpoints are explicit below.
      jwks_endpoint: `${process.env.KEYCLOAK_INTERNAL_URL!}/realms/hhh/protocol/openid-connect/certs`,
      checks: ["pkce", "state"],
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
        // Initial sign-in: decode roles from the access token payload.
        // We don't use idToken for roles because without wellKnown discovery
        // the openid-client Issuer isn't initialized for iss claim validation,
        // causing OAuthCallback errors. The access token always carries
        // realm_access.roles in its JWT payload.
        return {
          ...token,
          roles: decodeRoles(account.access_token),
          accessToken: account.access_token,
          accessTokenExpires: account.expires_at,
          refreshToken: account.refresh_token,
          idToken: account.id_token,
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
      session.idToken = token.idToken;
      if (token.error) session.error = token.error;
      return session;
    },
  },
};
