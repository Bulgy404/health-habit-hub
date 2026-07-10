import React from "react";
import { render, screen } from "@testing-library/react";
import AuditLogPage from "../app/(admin)/audit-log/page";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token", roles: ["admin"] },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/audit-log",
}));

const entry = {
  id: "e1",
  byUsername: "admin1",
  method: "POST",
  action: "create_study",
  resourceType: "study",
  resourceId: "s1",
  statusCode: 201,
  result: "succeeded",
  detail: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ entries: [entry] }),
  } as unknown as Response);
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("AuditLogPage", () => {
  it("renders the page title", async () => {
    render(<AuditLogPage />);
    expect(screen.getByRole("heading", { name: /audit log/i })).toBeInTheDocument();
  });

  it("shows a fetched entry's action and resource", async () => {
    render(<AuditLogPage />);
    expect(await screen.findByText("create_study")).toBeInTheDocument();
    expect(screen.getByText("study")).toBeInTheDocument();
    expect(screen.getByText("s1")).toBeInTheDocument();
  });

  it("shows the empty state when there are no entries", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [] }),
    } as unknown as Response);
    render(<AuditLogPage />);
    expect(await screen.findByText(/no results/i)).toBeInTheDocument();
  });
});
