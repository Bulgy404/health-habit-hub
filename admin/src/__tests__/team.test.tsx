import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TeamPage from "../app/(admin)/team/page";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token", roles: ["admin"] },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/team",
}));

const alice = {
  id: "u1",
  username: "alice",
  email: "alice@x.test",
  roles: ["admin", "researcher"],
};
const bob = { id: "u2", username: "bob", email: "bob@x.test", roles: ["researcher"] };

function mockFetchImplementation() {
  return jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (url.includes("/team/search")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ users: [{ id: "u3", username: "carol", email: "carol@x.test" }] }),
      } as unknown as Response);
    }
    if (opts?.method === "POST" || opts?.method === "DELETE") {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as unknown as Response);
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ members: [alice, bob] }),
    } as unknown as Response);
  });
}

beforeEach(() => {
  global.fetch = mockFetchImplementation();
  window.confirm = jest.fn().mockReturnValue(true);
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("TeamPage", () => {
  it("renders the page title", async () => {
    render(<TeamPage />);
    expect(screen.getByRole("heading", { name: /team & roles/i })).toBeInTheDocument();
  });

  it("shows current members with their roles", async () => {
    render(<TeamPage />);
    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("searching and granting a role calls the grant endpoint", async () => {
    const user = userEvent.setup();
    render(<TeamPage />);
    await screen.findByText("alice");

    await user.click(screen.getByRole("button", { name: /manage roles/i }));
    await user.type(screen.getByPlaceholderText(/search by username or email/i), "carol");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText("carol")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /grant admin/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/team/u3/roles"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("revoking a role calls the revoke endpoint after confirmation", async () => {
    const user = userEvent.setup();
    render(<TeamPage />);
    await screen.findByText("bob");

    const revokeButtons = screen.getAllByRole("button", { name: /revoke researcher/i });
    await user.click(revokeButtons[revokeButtons.length - 1]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/team/u2/roles/researcher"),
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });
});
