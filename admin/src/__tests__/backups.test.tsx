import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BackupsPage from "../app/(admin)/backups/page";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token", roles: ["admin"] },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/backups",
}));

// The current, healthy backup — used as `lastBackup` and the first row of
// `history`.
const manifestA = {
  date: "2026-07-10T10:00:00.000Z",
  file: "backup-2026-07-10.tar.gz",
  trigger: "manual",
  sizeBytes: 5 * 1024 * 1024,
  mongoOk: true,
  mongoIncluded: true,
  lightragOk: true,
  lightragIncluded: true,
  neo4jOk: true,
  neo4jIncluded: true,
  keycloakOk: true,
  keycloakSkipped: false,
  keycloakIncluded: true,
  errors: 0,
  errorLog: "",
  durationSeconds: 120,
};

// An older backup with a known-failed component, used to exercise the
// restore modal's "known issues" warning gate.
const manifestB = {
  date: "2026-07-09T10:00:00.000Z",
  file: "backup-2026-07-09.tar.gz",
  trigger: "scheduled",
  sizeBytes: 3 * 1024 * 1024,
  mongoOk: false,
  mongoIncluded: true,
  lightragOk: true,
  lightragIncluded: true,
  neo4jOk: true,
  neo4jIncluded: true,
  keycloakOk: true,
  keycloakSkipped: false,
  keycloakIncluded: true,
  errors: 1,
  errorLog: "mongo dump failed",
  durationSeconds: 90,
};

const defaultStatus: {
  lastBackup: typeof manifestA | null;
  history: (typeof manifestA)[];
  running: boolean;
} = { lastBackup: manifestA, history: [manifestA, manifestB], running: false };

const defaultAuditLog = [
  {
    id: "a1",
    byUsername: "alice",
    action: "trigger",
    filename: null,
    result: "succeeded",
    detail: null,
    createdAt: "2026-07-10T10:00:00.000Z",
  },
  {
    id: "a2",
    byUsername: "bob",
    action: "restore",
    filename: manifestB.file,
    result: "failed",
    detail: "oops",
    createdAt: "2026-07-09T09:00:00.000Z",
  },
];

type JobLike = Record<string, unknown> | null;

/**
 * URL-branching fetch mock covering every distinct backups endpoint: the
 * three status/job/audit-log GETs, trigger, upload, restore-token, restore,
 * download and delete. `endsWith` (rather than `includes`) keeps `/restore`
 * from accidentally matching `/restore-token` requests.
 */
function mockFetchImplementation(overrides?: {
  status?: typeof defaultStatus;
  job?: JobLike;
  auditLog?: typeof defaultAuditLog;
}) {
  const status = overrides?.status ?? defaultStatus;
  const job = overrides?.job ?? null;
  const auditLog = overrides?.auditLog ?? defaultAuditLog;

  return jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (url.includes("/admin/backups/status")) {
      return Promise.resolve({ ok: true, json: async () => status } as unknown as Response);
    }
    if (url.includes("/admin/backups/jobs/current")) {
      return Promise.resolve({ ok: true, json: async () => job } as unknown as Response);
    }
    if (url.includes("/admin/backups/audit-log")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ entries: auditLog }),
      } as unknown as Response);
    }
    if (url.endsWith("/trigger") && method === "POST") {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as unknown as Response);
    }
    if (url.endsWith("/upload") && method === "POST") {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as unknown as Response);
    }
    if (url.endsWith("/restore-token") && method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ token: "restore-tok-123" }),
      } as unknown as Response);
    }
    if (url.endsWith("/restore") && method === "POST") {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as unknown as Response);
    }
    if (url.endsWith("/download")) {
      return Promise.resolve({
        ok: true,
        blob: async () => new Blob(["archive-bytes"]),
      } as unknown as Response);
    }
    if (method === "DELETE") {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as unknown as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as unknown as Response);
  });
}

beforeEach(() => {
  global.fetch = mockFetchImplementation();
  global.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock");
  global.URL.revokeObjectURL = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("BackupsPage", () => {
  it("renders without crashing", () => {
    render(<BackupsPage />);
  });

  it("renders the page title", async () => {
    render(<BackupsPage />);
    expect(await screen.findByRole("heading", { name: /backups/i })).toBeInTheDocument();
  });

  it("renders the last-backup summary with per-component status badges", async () => {
    render(<BackupsPage />);
    await screen.findAllByText(manifestA.file);

    // manifestA is healthy across the board — appears in both the
    // highlighted "last backup" row and its history-table row.
    expect(screen.getAllByTitle("Mongo: OK").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("LightRAG: OK").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Neo4j: OK").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Keycloak: OK").length).toBeGreaterThan(0);

    // manifestB (history only) has a known-failed Mongo component.
    expect(screen.getByTitle("Mongo: failed")).toBeInTheDocument();
  });

  it("triggering a new backup lets components be toggled off and sends them in the request body", async () => {
    const user = userEvent.setup();
    render(<BackupsPage />);
    await screen.findAllByText(manifestA.file);

    await user.click(screen.getByRole("button", { name: /trigger backup now/i }));
    expect(screen.getByRole("heading", { name: /trigger a backup/i })).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: /^mongo$/i }));
    await user.click(screen.getByRole("switch", { name: /^neo4j$/i }));
    await user.click(screen.getByRole("button", { name: /start backup/i }));

    await waitFor(() => {
      const postCall = (global.fetch as jest.Mock).mock.calls.find(
        (c) => String(c[0]).endsWith("/trigger") && c[1]?.method === "POST"
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall![1].body as string);
      expect(body.services).toEqual({
        mongo: false,
        neo4j: false,
        lightrag: true,
        keycloak: true,
      });
    });

    // Modal closes once the trigger succeeds.
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /trigger a backup/i })).not.toBeInTheDocument();
    });
  });

  it("uploading a backup sends a multipart POST with the selected file", async () => {
    const user = userEvent.setup();
    render(<BackupsPage />);
    await screen.findAllByText(manifestA.file);

    const uploadButton = screen.getByRole("button", { name: /upload backup/i });
    expect(uploadButton).toBeDisabled();

    const file = new File(["backup-data"], "backup-2026-07-11.tar.gz", {
      type: "application/gzip",
    });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    expect(uploadButton).not.toBeDisabled();
    await user.click(uploadButton);

    await waitFor(() => {
      const uploadCall = (global.fetch as jest.Mock).mock.calls.find(
        (c) => String(c[0]).endsWith("/upload") && c[1]?.method === "POST"
      );
      expect(uploadCall).toBeDefined();
      const body = uploadCall![1].body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect((body.get("file") as File).name).toBe("backup-2026-07-11.tar.gz");
    });
  });

  it("restore modal blocks confirming until the exact filename is typed, then starts the restore", async () => {
    const user = userEvent.setup();
    render(<BackupsPage />);
    await screen.findAllByText(manifestA.file);

    // Index 0 is the highlighted "last backup" row (manifestA).
    const restoreButtons = screen.getAllByRole("button", { name: /^restore$/i });
    await user.click(restoreButtons[0]);

    // Scope to the modal via its heading's parent rather than a CSS class —
    // the CSS-module mock resolves every class name to "undefined" once run
    // through Babel's ESM interop (its Proxy answers truthy to `__esModule`,
    // which derails `import styles from ...`), so no element actually ends
    // up with class="modal" in this test environment.
    const modalHeading = screen.getByRole("heading", { name: /restore from backup/i });
    const modal = modalHeading.parentElement as HTMLElement;

    const confirmBtn = within(modal).getByRole("button", { name: /^restore$/i });
    const filenameInput = within(modal).getByPlaceholderText(manifestA.file);

    expect(confirmBtn).toBeDisabled();

    await user.type(filenameInput, "wrong-file.tar.gz");
    expect(confirmBtn).toBeDisabled();

    await user.clear(filenameInput);
    await user.type(filenameInput, manifestA.file);
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);

    await waitFor(() => {
      const restoreCall = (global.fetch as jest.Mock).mock.calls.find(
        (c) => String(c[0]).endsWith("/restore") && c[1]?.method === "POST"
      );
      expect(restoreCall).toBeDefined();
      const body = JSON.parse(restoreCall![1].body as string);
      expect(body).toEqual({
        confirmFilename: manifestA.file,
        restoreToken: "restore-tok-123",
        acknowledgeWarnings: false,
        restoreKeycloak: true,
      });
    });

    // A fresh one-time restore token is minted before the restore itself.
    expect(
      (global.fetch as jest.Mock).mock.calls.some(
        (c) => String(c[0]).endsWith("/restore-token") && c[1]?.method === "POST"
      )
    ).toBe(true);

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: /restore from backup/i })
      ).not.toBeInTheDocument();
    });
  });

  it("restore modal requires acknowledging known issues before it can be confirmed", async () => {
    const user = userEvent.setup();
    render(<BackupsPage />);
    await screen.findAllByText(manifestB.file);

    // Index 0 = highlighted row (manifestA), 1 = history row for manifestA,
    // 2 = history row for manifestB (the one with a known-failed component).
    const restoreButtons = screen.getAllByRole("button", { name: /^restore$/i });
    await user.click(restoreButtons[2]);

    const modalHeading = screen.getByRole("heading", { name: /restore from backup/i });
    const modal = modalHeading.parentElement as HTMLElement;
    expect(within(modal).getByText(/known issues/i)).toBeInTheDocument();
    expect(within(modal).getByText(/Mongo failed when it was created/i)).toBeInTheDocument();

    const filenameInput = within(modal).getByPlaceholderText(manifestB.file);
    await user.type(filenameInput, manifestB.file);

    const confirmBtn = within(modal).getByRole("button", { name: /^restore$/i });
    // Filename is correct, but the warning hasn't been acknowledged yet.
    expect(confirmBtn).toBeDisabled();

    await user.click(within(modal).getByRole("switch", { name: /restore anyway/i }));
    expect(confirmBtn).not.toBeDisabled();
  });

  it("delete modal blocks confirming until the exact filename is typed, then deletes the backup", async () => {
    const user = userEvent.setup();
    render(<BackupsPage />);
    await screen.findAllByText(manifestA.file);

    const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
    await user.click(deleteButtons[0]);

    const modalHeading = screen.getByRole("heading", { name: /delete backup/i });
    const modal = modalHeading.parentElement as HTMLElement;

    const confirmBtn = within(modal).getByRole("button", { name: /^delete$/i });
    const filenameInput = within(modal).getByPlaceholderText(manifestA.file);

    expect(confirmBtn).toBeDisabled();

    await user.type(filenameInput, "not-the-right-name.tar.gz");
    expect(confirmBtn).toBeDisabled();

    await user.clear(filenameInput);
    await user.type(filenameInput, manifestA.file);
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/admin/backups/${manifestA.file}`),
        expect.objectContaining({ method: "DELETE" })
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /delete backup/i })).not.toBeInTheDocument();
    });
  });

  it("downloading a backup fetches the file and creates a blob URL", async () => {
    const user = userEvent.setup();
    render(<BackupsPage />);
    await screen.findAllByText(manifestA.file);

    const downloadButtons = screen.getAllByRole("button", { name: /^download$/i });
    await user.click(downloadButtons[0]);

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalled();
    });
    expect(
      (global.fetch as jest.Mock).mock.calls.some((c) => String(c[0]).endsWith("/download"))
    ).toBe(true);
  });

  it("renders recent-activity audit entries", async () => {
    render(<BackupsPage />);
    await screen.findAllByText(manifestA.file);

    // Scope to the "Recent activity" table so its "Restore" action label
    // doesn't collide with the row-level Restore buttons.
    const auditHeading = screen.getByText("Recent activity");
    const auditTableWrap = auditHeading.nextElementSibling as HTMLElement;

    expect(within(auditTableWrap).getByText("alice")).toBeInTheDocument();
    expect(within(auditTableWrap).getByText("bob")).toBeInTheDocument();
    expect(within(auditTableWrap).getByText("Trigger")).toBeInTheDocument();
    expect(within(auditTableWrap).getByText("Restore")).toBeInTheDocument();
    expect(within(auditTableWrap).getByText("succeeded")).toBeInTheDocument();
    expect(within(auditTableWrap).getByText("failed")).toBeInTheDocument();
    expect(within(auditTableWrap).getByText(manifestB.file)).toBeInTheDocument();
  });

  it("disables trigger/restore/delete actions while a job is in progress", async () => {
    global.fetch = mockFetchImplementation({
      job: {
        jobId: "j1",
        type: "backup",
        phase: "running",
        startedAt: "2026-07-12T08:00:00.000Z",
      },
    });
    render(<BackupsPage />);
    await screen.findAllByText(manifestA.file);

    expect(screen.getByText(/backing up/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /trigger backup now/i })).toBeDisabled();

    for (const btn of screen.getAllByRole("button", { name: /^restore$/i })) {
      expect(btn).toBeDisabled();
    }
    for (const btn of screen.getAllByRole("button", { name: /^delete$/i })) {
      expect(btn).toBeDisabled();
    }
  });

  // Polling is driven by a setInterval inside a useEffect. Jest fake timers
  // interleaved with RTL's promise-based waitFor/userEvent are a known
  // source of flaky interaction (the interval and React's own scheduling
  // both want control of the clock), so we deliberately don't drive the
  // interval itself with jest.useFakeTimers() here. The behaviour that
  // actually matters — a status/job/audit-log re-fetch after something
  // happens — is already covered by the trigger/upload/restore/delete tests
  // above, each of which asserts a fresh GET follows the action.

  it("shows empty states when there are no backups and no activity", async () => {
    global.fetch = mockFetchImplementation({
      status: { lastBackup: null, history: [], running: false },
      auditLog: [],
    });
    render(<BackupsPage />);

    // Once for the "last backup" summary, once for the history table's empty row.
    expect(await screen.findAllByText(/no backups yet/i)).toHaveLength(2);
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });
});
