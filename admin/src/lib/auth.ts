import type { AuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";

declare module "next-auth" {
  interface Session {
    roles: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roles: string[];
  }
}

export const authOptions: AuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.roles = (profile as { realm_access?: { roles?: string[] } }).realm_access?.roles ?? [];
      }
      return token;
    },
    async session({ session, token }) {
      session.roles = token.roles ?? [];
      return session;
    },
  },
};
