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
    if (!opts?.method && url.includes("/admin/devices")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          total: 2,
          devices: [
            {
              id: "d1",
              userId: "u1",
              deviceId: "dev-1",
              platform: "ios",
              model: "iPhone 15 Pro",
              appVersion: "1.1.1+5",
              updatedAt: "2026-01-05T00:00:00.000Z",
            },
            {
              id: "d2",
              userId: "u1",
              deviceId: "dev-2",
              platform: "android",
              model: "Pixel 8",
              appVersion: "1.1.0+4",
              updatedAt: "2026-01-06T00:00:00.000Z",
            },
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

  it("shows a device count sourced from GET /admin/devices, independent of login sessions", async () => {
    render(<ParticipantsPage />);
    await screen.findByText("p-u1");

    // p-u1 has two mocked devices (iPhone 15 Pro + Pixel 8); p-u2 has none.
    expect(await screen.findByText("2 device(s)")).toBeInTheDocument();
    expect(screen.getAllByText("No devices").length).toBeGreaterThan(0);
  });

  it("clicking the device count opens a modal listing each device's model, platform, and app version", async () => {
    const user = userEvent.setup();
    render(<ParticipantsPage />);
    await screen.findByText("p-u1");

    await user.click(await screen.findByText("2 device(s)"));

    expect(await screen.findByText(/iPhone 15 Pro/)).toBeInTheDocument();
    expect(screen.getByText(/Pixel 8/)).toBeInTheDocument();
    expect(screen.getByText("ios")).toBeInTheDocument();
    expect(screen.getByText("android")).toBeInTheDocument();
    expect(screen.getByText("v1.1.1+5")).toBeInTheDocument();
    expect(screen.getByText("v1.1.0+4")).toBeInTheDocument();
  });

  it("renders a device with no captured metadata as 'Unknown device' instead of crashing", async () => {
    global.fetch = jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (!opts?.method && url.includes("/admin/devices")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            total: 1,
            devices: [
              {
                id: "d-legacy",
                userId: "u1",
                deviceId: null,
                platform: null,
                model: null,
                appVersion: null,
                updatedAt: "2026-01-02T00:00:00.000Z",
              },
            ],
          }),
        } as unknown as Response);
      }
      if (!opts?.method && url.includes("/admin/sessions")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ total: 0, sessions: [] }),
        } as unknown as Response);
      }
      if (url.includes("/test-tools")) {
        return Promise.resolve({ ok: true, json: async () => ({ enabled: false }) } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ participants: [participantA, participantB], total: 2 }),
      } as unknown as Response);
    });
    const user = userEvent.setup();
    render(<ParticipantsPage />);
    await screen.findByText("p-u1");

    await user.click(await screen.findByText("1 device(s)"));
    expect(await screen.findByText("Unknown device")).toBeInTheDocument();
  });

  it("revoke button revokes all login sessions for a participant, unaffected by device count", async () => {
    const user = userEvent.setup();
    render(<ParticipantsPage />);
    await screen.findByText("p-u1");

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

    // Revoking sessions doesn't touch device data — the count stays as-is.
    expect(within(rowU1).getByText("2 device(s)")).toBeInTheDocument();
  });

  it("the revoke button is disabled for a participant with no login sessions", async () => {
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
