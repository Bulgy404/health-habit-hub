import { IDENTITY_ROLES } from "@/lib/useIdentityGuard";

/**
 * Role-visibility rules, asserted as data rather than through the DOM.
 *
 * The point being protected: an `admin` has NO standing access to the identity
 * register, and a `researcher` may never hold an identity role. The API is the
 * authority on both, but the UI must not offer a door the API will slam.
 */
function canReadPii(roles: string[]): boolean {
  const identity = IDENTITY_ROLES.filter((r) => roles.includes(r));
  if (roles.includes("researcher") && identity.length > 0) return false;
  return identity.includes("identity-manager") || identity.includes("study-nurse");
}

function seesIdentityNav(roles: string[]): boolean {
  return IDENTITY_ROLES.some((r) => roles.includes(r));
}

describe("identity role visibility", () => {
  it("a nurse and a manager may read names", () => {
    expect(canReadPii(["study-nurse"])).toBe(true);
    expect(canReadPii(["identity-manager"])).toBe(true);
  });

  it("a monitor may NOT read names", () => {
    // Monitors approve re-identification and read audit logs; they do not
    // browse the roster's PII.
    expect(canReadPii(["monitor"])).toBe(false);
    expect(seesIdentityNav(["monitor"])).toBe(true);
  });

  it("an admin has no standing access to the register", () => {
    expect(canReadPii(["admin"])).toBe(false);
    expect(seesIdentityNav(["admin"])).toBe(false);
  });

  it("a researcher has no access, and cannot gain it by also holding a nurse role", () => {
    expect(canReadPii(["researcher"])).toBe(false);
    expect(canReadPii(["researcher", "study-nurse"])).toBe(false);
    expect(canReadPii(["researcher", "identity-manager"])).toBe(false);
  });

  it("an admin holding monitor still cannot read names", () => {
    expect(canReadPii(["admin", "monitor"])).toBe(false);
    expect(seesIdentityNav(["admin", "monitor"])).toBe(true);
  });

  it("a plain participant sees nothing", () => {
    expect(seesIdentityNav(["user"])).toBe(false);
    expect(canReadPii([])).toBe(false);
  });
});
