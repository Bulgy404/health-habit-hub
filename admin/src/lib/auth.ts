import type { AuthOptions } from "next-auth";
import type { OAuthConfig } from "next-auth/providers/oauth";

declare module "next-auth" {
  interface Session {
    roles: string[];
    accessToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roles: string[];
    accessToken?: string;
  }
}

/**
 * NextAuth configuration object with Keycloak OAuth provider.
 * Extracts Keycloak realm roles and the access token into the session.
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
        token.roles = (profile as { realm_access?: { roles?: string[] } }).realm_access?.roles ?? [];
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.roles = token.roles ?? [];
      session.accessToken = token.accessToken ?? "";
      return session;
    },
  },
};
