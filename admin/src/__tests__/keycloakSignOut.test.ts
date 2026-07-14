import { buildKeycloakLogoutUrl } from "../lib/keycloakSignOut";

describe("buildKeycloakLogoutUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses the real Keycloak end-session endpoint when env vars are set", () => {
    process.env.NEXT_PUBLIC_KEYCLOAK_BROWSER_URL = "https://example.com/auth";
    process.env.NEXT_PUBLIC_NEXTAUTH_URL = "https://example.com/admin";

    const url = buildKeycloakLogoutUrl("https://example.com/admin");

    expect(url).toBe(
      "https://example.com/auth/realms/hhh/protocol/openid-connect/logout?post_logout_redirect_uri=https%3A%2F%2Fexample.com%2Fadmin&client_id=hhh-admin"
    );
  });

  it("falls back instead of producing a broken '/undefined/' URL when env vars are unset", () => {
    delete process.env.NEXT_PUBLIC_KEYCLOAK_BROWSER_URL;
    delete process.env.NEXT_PUBLIC_NEXTAUTH_URL;

    const url = buildKeycloakLogoutUrl("http://admin.localhost");

    expect(url).not.toContain("undefined");
    expect(url).toContain("http://localhost:8080/realms/hhh/protocol/openid-connect/logout");
    expect(url).toContain(encodeURIComponent("http://admin.localhost"));
  });

  it("falls back for blank-string vars the same as unset (build-time blank is possible too)", () => {
    process.env.NEXT_PUBLIC_KEYCLOAK_BROWSER_URL = "  ";
    process.env.NEXT_PUBLIC_NEXTAUTH_URL = "";

    const url = buildKeycloakLogoutUrl("http://admin.localhost");

    expect(url).not.toContain("undefined");
    expect(url.startsWith("http://localhost:8080/realms/hhh/protocol/openid-connect/logout")).toBe(
      true
    );
  });

  it("includes id_token_hint when a session ID token is passed, so Keycloak logs out silently instead of showing its confirmation page", () => {
    process.env.NEXT_PUBLIC_KEYCLOAK_BROWSER_URL = "https://example.com/auth";
    process.env.NEXT_PUBLIC_NEXTAUTH_URL = "https://example.com/admin";

    const url = buildKeycloakLogoutUrl("https://example.com/admin", "the-id-token");

    expect(url).toContain("id_token_hint=the-id-token");
  });

  it("omits id_token_hint entirely when no ID token is available", () => {
    process.env.NEXT_PUBLIC_KEYCLOAK_BROWSER_URL = "https://example.com/auth";
    process.env.NEXT_PUBLIC_NEXTAUTH_URL = "https://example.com/admin";

    const url = buildKeycloakLogoutUrl("https://example.com/admin");

    expect(url).not.toContain("id_token_hint");
  });
});
