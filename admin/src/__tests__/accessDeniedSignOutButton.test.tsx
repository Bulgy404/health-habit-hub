/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccessDeniedSignOutButton } from "../app/access-denied/sign-out-button";
import { signOutOfKeycloak } from "../lib/keycloakSignOut";

jest.mock("../lib/keycloakSignOut", () => ({
  signOutOfKeycloak: jest.fn(),
}));

const mockedSignOut = signOutOfKeycloak as jest.Mock;

describe("AccessDeniedSignOutButton", () => {
  beforeEach(() => {
    mockedSignOut.mockClear();
  });

  it("performs the full Keycloak sign-out, not a plain /api/auth/signout link", async () => {
    // Regression test: a plain link to /api/auth/signout only clears the
    // local NextAuth session, leaving the Keycloak SSO session alive — the
    // next "Sign in with Keycloak" click then silently re-authenticates the
    // same no-permission user via SSO, landing back here in an infinite
    // sign-out/sign-in loop.
    render(<AccessDeniedSignOutButton label="Sign out" />);

    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button).not.toHaveAttribute("href");

    await userEvent.click(button);

    expect(mockedSignOut).toHaveBeenCalledTimes(1);
  });
});
