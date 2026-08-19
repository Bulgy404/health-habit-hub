import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ParticipantsPage from "../app/(admin)/participants/page";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token", roles: ["admin"] },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/participants",
}));

const participantA = {
  userId: "u1",
  username: "p-u1",
  group: "G1",
  enrolledAt: "2026-01-01T00:00:00.000Z",
};
const participantB = {
  userId: "u2",
  username: "p-u2",
  group: "G2",
  enrolledAt: "2026-01-02T00:00:00.000Z",
};

function mockFetchImplementation() {
  return jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (url.includes("/test-tools")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ enabled: false }),
      } as unknown as Response);
    }
    if (!opts?.method && url.includes("/admin/sessions")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          total: 2,
          sessions: [
            { id: "s1", participantId: "u1", deviceType: "ios", lastSeen: "2026-01-05T00:00:00.000Z" },
            { id: "s2", participantId: "u1", deviceType: "android", lastSeen: "2026-01-06T00:00:00.000Z" },
          ],
        }),
      } as unknown as Response);
    }
    if (opts?.method === "DELETE" && url.includes("/admin/sessions/")) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as unknown as Response);
    }
    if (opts?.method === "POST" && url.includes("/admin/participants")) {
      const body = JSON.parse(String(opts.body));
      if (body.count > 1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            participants: Array.from({ length: body.count }, (_, i) => ({
              userId: `bulk-${i}`,
              username: `p-bulk-${i}`,
              tokenCardUrl: `/admin/participants/bulk-${i}/token-card`,
            })),
          }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ userId: "new-1", username: "p-new-1" }),
      } as unknown as Response);
    }
    if (opts?.method === "DELETE") {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as unknown as Response);
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ participants: [participantA, participantB], total: 2 }),
    } as unknown as Response);
  });
}

beforeEach(() => {
  global.fetch = mockFetchImplementation();
  window.confirm = jest.fn().mockReturnValue(true);
  global.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock");
  global.URL.revokeObjectURL = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("ParticipantsPage bulk operations", () => {
  it("creating with a count > 1 shows every created participant", async () => {
    const user = userEvent.setup();
    render(<ParticipantsPage />);
    await screen.findByText("p-u1");

    await user.click(screen.getByRole("button", { name: /new participant/i }));
    const countInput = screen.getByRole("spinbutton");
    await user.clear(countInput);
    await user.type(countInput, "3");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(await screen.findByText("p-bulk-0")).toBeInTheDocument();
    expect(screen.getByText("p-bulk-1")).toBeInTheDocument();
    expect(screen.getByText("p-bulk-2")).toBeInTheDocument();
    expect(screen.getByText(/3 participants created/i)).toBeInTheDocument();
  });

  it("selecting rows shows the bulk action bar with the right count", async () => {
    const user = userEvent.setup();
    render(<ParticipantsPage />);
    await screen.findByText("p-u1");

    await user.click(screen.getByLabelText("Select p-u1"));
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Select p-u2"));
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
  });

  it("deleting selected participants calls DELETE for each and clears the selection", async () => {
    const user = userEvent.setup();
    render(<ParticipantsPage />);
    await screen.findByText("p-u1");

    await user.click(screen.getByLabelText("Select all on this page"));
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /delete selected/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/admin/participants/u1"),
        expect.objectContaining({ method: "DELETE" })
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/admin/participants/u2"),
        expect.objectContaining({ method: "DELETE" })
      );
    });
    await waitFor(() => {
      expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
    });
  });

  it("shows a device count for a participant with sessions, and revokes all of them at once", async () => {
    const user = userEvent.setup();
    render(<ParticipantsPage />);
    await screen.findByText("p-u1");

    // p-u1 has two mocked sessions (ios + android); p-u2 has none.
    expect(await screen.findByText("2 device(s)")).toBeInTheDocument();
    expect(screen.getAllByText("No devices").length).toBeGreaterThan(0);

    const rowU1 = screen.getByText("p-u1").closest("tr")!;
    const { getByRole } = within(rowU1);
    await user.click(getByRole("button", { name: /revoke/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/admin/sessions/s1"),
        expect.objectContaining({ method: "DELETE" })
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/admin/sessions/s2"),
        expect.objectContaining({ method: "DELETE" })
      );
    });

    // Once revoked, the column falls back to "No devices" for that row too.
    await waitFor(() => {
      expect(within(rowU1).getByText("No devices")).toBeInTheDocument();
    });
  });

  it("the revoke button is disabled for a participant with no devices", async () => {
    render(<ParticipantsPage />);
    await screen.findByText("p-u2");

    const rowU2 = screen.getByText("p-u2").closest("tr")!;
    const revokeBtn = within(rowU2).getByRole("button", { name: /revoke/i });
    expect(revokeBtn).toBeDisabled();
  });

  it("exporting selected participants builds a CSV download", async () => {
    const user = userEvent.setup();
    render(<ParticipantsPage />);
    await screen.findByText("p-u1");

    await user.click(screen.getByLabelText("Select p-u1"));
    await user.click(screen.getByRole("button", { name: /export selected/i }));

    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });
});
