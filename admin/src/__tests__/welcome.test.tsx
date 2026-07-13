import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomePage from "../app/welcome/page";
import { WELCOME_COOKIE } from "@/lib/welcome";

// WelcomePage itself never reads useSession/apiFetch — it's a plain client
// component (step state + a cookie write on finish), so unlike the (admin)
// pages it needs no next-auth/api mocking, only next/navigation.
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  usePathname: () => "/welcome",
}));

// Whether the walkthrough re-shows on a later visit is decided by
// app/page.tsx (a server component that reads the `hhh_onboarded` cookie via
// next/headers and redirects to /welcome or /studies) — not by WelcomePage,
// which always renders step 0 when mounted. That gating logic lives outside
// this component, so it isn't exercised here. What we *can* verify from
// this file is the other half of that contract: that finishing/skipping the
// walkthrough actually writes the cookie app/page.tsx will later check.
//
// jsdom also silently drops cookies with the `Secure` attribute when the
// test document's origin is http://localhost (no TLS), so asserting on
// `document.cookie` directly after the write would fail for an environment
// reason, not an app-logic reason. Instead we spy on the `document.cookie`
// setter to capture the raw string the app attempted to write.
let cookieWrites: string[];
beforeEach(() => {
  cookieWrites = [];
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => "",
    set: (value: string) => {
      cookieWrites.push(value);
    },
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// The active dot is rendered with a template-literal className
// (`${styles.dot} ${styles.dotActive}`), while inactive dots use a bare
// `styles.dot` expression. Under this suite's CSS-module mock (see
// src/__tests__/__mocks__/next-intl.tsx sibling styleMock, which resolves
// to a plain string in this environment rather than the intended proxy
// object) the template-literal branch renders as a non-empty `class`
// attribute and the bare-expression branch renders with no `class`
// attribute at all. That happens to be a stable, if incidental, signal we
// can use to identify which of the 3 dots is "active" without depending on
// real class names.
function activeDotIndex(container: HTMLElement): number {
  const dots = Array.from(container.querySelectorAll("span")).filter(
    (el) => el.textContent === "" && el.children.length === 0
  );
  return dots.findIndex((d) => d.hasAttribute("class"));
}

describe("WelcomePage", () => {
  it("renders without crashing", () => {
    render(<WelcomePage />);
  });

  it("renders the 3-step walkthrough starting at step 1", () => {
    const { container } = render(<WelcomePage />);

    expect(screen.getByRole("heading", { name: "Welcome to the HHH Portal" })).toBeInTheDocument();
    expect(
      screen.getByText(/this is where you manage studies, participants/i)
    ).toBeInTheDocument();

    const dots = Array.from(container.querySelectorAll("span")).filter(
      (el) => el.textContent === "" && el.children.length === 0
    );
    expect(dots).toHaveLength(3);
    expect(activeDotIndex(container)).toBe(0);
  });

  it("the page indicator dot advances as Next moves through steps", async () => {
    const user = userEvent.setup();
    const { container } = render(<WelcomePage />);

    expect(activeDotIndex(container)).toBe(0);

    await user.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("heading", { name: "Find your way around" })).toBeInTheDocument();
    expect(activeDotIndex(container)).toBe(1);

    await user.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("heading", { name: "You're ready to go" })).toBeInTheDocument();
    expect(activeDotIndex(container)).toBe(2);
  });

  it('"Skip" jumps directly to the finish action', async () => {
    const user = userEvent.setup();
    render(<WelcomePage />);

    await user.click(screen.getByRole("button", { name: /skip/i }));

    expect(mockReplace).toHaveBeenCalledWith("/studies");
    expect(cookieWrites.some((c) => c.startsWith(`${WELCOME_COOKIE}=1`))).toBe(true);
  });

  it('progressing through all steps via "Next"/"Get started" lands on the studies list', async () => {
    const user = userEvent.setup();
    render(<WelcomePage />);

    // Step 1 of 3
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    // Step 2 of 3
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("heading", { name: "You're ready to go" })).toBeInTheDocument();

    // Final step's primary button reads "Get started" instead of "Next".
    expect(screen.queryByRole("button", { name: /^next$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /get started/i }));

    expect(mockReplace).toHaveBeenCalledWith("/studies");
    expect(cookieWrites.some((c) => c.startsWith(`${WELCOME_COOKIE}=1`))).toBe(true);
  });

  it('shows a "Back" button once the user has moved past the first step', async () => {
    const user = userEvent.setup();
    render(<WelcomePage />);

    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByRole("heading", { name: "Welcome to the HHH Portal" })).toBeInTheDocument();
  });
});
