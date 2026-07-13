import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DevicesPage from "../app/(admin)/devices/page";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token", roles: ["admin"] },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/devices",
}));

const sessionA = {
  id: "s1",
  participantId: "u1",
  deviceType: "ios",
  appVersion: "1.2.3",
  lastSeen: "2026-07-10T09:00:00.000Z",
};
const sessionB = {
  id: "s2",
  participantId: "u2",
  deviceType: "android",
  appVersion: "1.3.0",
  lastSeen: null,
};
const sessionC = {
  id: "s3",
  participantId: "u3",
  deviceType: "web",
  appVersion: "2.0.0",
  lastSeen: "2026-07-11T09:00:00.000Z",
};

function mockFetchImplementation() {
  return jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (opts?.method === "DELETE") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true }),
      } as unknown as Response);
    }
    // Page 2 of the (mocked) larger dataset returns a different session so the
    // pagination test can tell the two page loads apart.
    if (url.includes("page=2")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ sessions: [sessionC], total: 250 }),
      } as unknown as Response);
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ sessions: [sessionA, sessionB], total: 250 }),
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

describe("DevicesPage", () => {
  it("renders without crashing", () => {
    render(<DevicesPage />);
  });

  it("renders the page title", async () => {
    render(<DevicesPage />);
    expect(await screen.findByRole("heading", { name: /devices/i })).toBeInTheDocument();
  });

  it("renders the sessions table with participant, device type, app version and last seen", async () => {
    render(<DevicesPage />);

    expect(await screen.findByText("u1")).toBeInTheDocument();
    expect(screen.getByText("ios")).toBeInTheDocument();
    expect(screen.getByText("1.2.3")).toBeInTheDocument();

    expect(screen.getByText("u2")).toBeInTheDocument();
    expect(screen.getByText("android")).toBeInTheDocument();
    // sessionB has no lastSeen, which renders as the "—" placeholder.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("revoking a session asks for confirmation and does not call DELETE when cancelled", async () => {
    const user = userEvent.setup();
    window.confirm = jest.fn().mockReturnValue(false);
    render(<DevicesPage />);
    await screen.findByText("u1");

    const revokeButtons = screen.getAllByRole("button", { name: /^revoke$/i });
    await user.click(revokeButtons[0]);

    expect(window.confirm).toHaveBeenCalledWith(
      "Revoke this device session? The user will be signed out."
    );
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/admin/sessions/s1"),
      expect.objectContaining({ method: "DELETE" })
    );
    // The session is still shown since nothing was revoked.
    expect(screen.getByText("u1")).toBeInTheDocument();
  });

  it("revoking a session calls DELETE and removes it from the table once confirmed", async () => {
    const user = userEvent.setup();
    render(<DevicesPage />);
    await screen.findByText("u1");

    const revokeButtons = screen.getAllByRole("button", { name: /^revoke$/i });
    await user.click(revokeButtons[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/admin/sessions/s1"),
        expect.objectContaining({ method: "DELETE" })
      );
    });
    await waitFor(() => {
      expect(screen.queryByText("u1")).not.toBeInTheDocument();
    });
  });

  it("pagination controls move between pages using the mocked larger dataset", async () => {
    const user = userEvent.setup();
    render(<DevicesPage />);

    await screen.findByText(/250 total/i);
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^next$/i }));

    await screen.findByText("u3");
    expect(screen.getByText(/page 2 of 3/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });

  it("shows an empty state when there are no sessions", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [], total: 0 }),
    } as unknown as Response);

    render(<DevicesPage />);
    expect(await screen.findByText(/no active device sessions/i)).toBeInTheDocument();
  });
});
