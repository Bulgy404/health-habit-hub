import React from "react";
import { render, screen } from "@testing-library/react";
import RestoreAttemptsPage from "../app/(admin)/restore-attempts/page";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token", roles: ["admin"] },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/restore-attempts",
}));

const entry = {
  id: "a1",
  ip: "203.0.113.1",
  usernameAttempted: "11111111-2222-3333-4444-555555555555",
  outcome: "invalid_credentials",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const flaggedIp = {
  ip: "203.0.113.1",
  failCount: 4,
  lastAttemptAt: "2026-01-01T00:05:00.000Z",
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      entries: [entry],
      total: 1,
      page: 1,
      limit: 50,
      flaggedIps: [],
    }),
  } as unknown as Response);
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("RestoreAttemptsPage", () => {
  it("renders the page title", async () => {
    render(<RestoreAttemptsPage />);
    expect(screen.getByRole("heading", { name: /restore attempts/i })).toBeInTheDocument();
  });

  it("shows a fetched attempt's ip and outcome", async () => {
    render(<RestoreAttemptsPage />);
    expect(await screen.findByText("203.0.113.1")).toBeInTheDocument();
    // "Invalid credentials" also appears as a filter <option>, so there
    // are two matches — the outcome filter and the table badge.
    expect(screen.getAllByText("Invalid credentials").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("11111111-2222-3333-4444-555555555555")).toBeInTheDocument();
  });

  it("shows the empty state when there are no entries", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [],
        total: 0,
        page: 1,
        limit: 50,
        flaggedIps: [],
      }),
    } as unknown as Response);
    render(<RestoreAttemptsPage />);
    expect(await screen.findByText(/no results/i)).toBeInTheDocument();
  });

  it("renders a flagged-IPs alert section when the backend returns one", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [entry],
        total: 1,
        page: 1,
        limit: 50,
        flaggedIps: [flaggedIp],
      }),
    } as unknown as Response);
    render(<RestoreAttemptsPage />);
    expect(await screen.findByText(/flagged ips/i)).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("does not render the flagged-IPs section when there are none", async () => {
    render(<RestoreAttemptsPage />);
    await screen.findByText("203.0.113.1");
    expect(screen.queryByText(/flagged ips/i)).not.toBeInTheDocument();
  });
});
