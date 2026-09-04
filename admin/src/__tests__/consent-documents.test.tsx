import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConsentDocumentsPage from "../app/(admin)/consent-documents/page";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token", roles: ["admin"] },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/consent-documents",
}));

const LANGS = ["en", "de", "ja", "fr", "nl"];

function language(lang: string, overrides = {}) {
  return {
    lang,
    source: "file",
    version: "1.0.0",
    effectiveDate: "2026-09-04",
    bindingLanguage: "de",
    status: "published",
    hasPlaceholders: false,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

function summary(overrides = {}) {
  return {
    slug: "habconnect-clinical",
    ready: true,
    reasons: [],
    languages: LANGS.map((l) => language(l)),
    studies: [],
    ...overrides,
  };
}

function editable(overrides = {}) {
  return {
    slug: "habconnect-clinical",
    lang: "de",
    source: "file",
    body: "Ein ausreichend langer Einwilligungstext für die Bearbeitung.",
    version: "1.0.0",
    effectiveDate: "2026-09-04",
    bindingLanguage: "de",
    status: "draft",
    updatedAt: null,
    updatedBy: null,
    fileAvailable: true,
    fileBody: "Der ausgelieferte Text.",
    hasPlaceholders: false,
    ...overrides,
  };
}

/** Routes each fetch by URL and method, so a test can assert on one call. */
function mockApi(handlers: {
  list?: unknown;
  get?: unknown;
  put?: { ok: boolean; body: unknown };
}) {
  return jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "PUT") {
      const res = handlers.put ?? { ok: true, body: { ready: true, reasons: [] } };
      return Promise.resolve({
        ok: res.ok,
        status: res.ok ? 200 : 400,
        json: async () => res.body,
      } as unknown as Response);
    }
    const isDetail = /\/consent-documents\/[^/]+\/[^/?]+$/.test(url);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () =>
        isDetail
          ? (handlers.get ?? editable())
          : (handlers.list ?? { languages: LANGS, documents: [summary()] }),
    } as unknown as Response);
  });
}

afterEach(() => {
  jest.resetAllMocks();
});

describe("ConsentDocumentsPage", () => {
  it("lists a document with a row for every supported language", async () => {
    global.fetch = mockApi({});
    render(<ConsentDocumentsPage />);

    expect(await screen.findByText("habconnect-clinical")).toBeInTheDocument();
    for (const label of ["English", "Deutsch", "日本語", "Français", "Nederlands"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("distinguishes a language edited here from one shipped with the app", async () => {
    global.fetch = mockApi({
      list: {
        languages: LANGS,
        documents: [
          summary({
            languages: [
              language("en", { source: "db" }),
              language("de"),
              language("ja", { source: "missing", version: null, status: null }),
              language("fr"),
              language("nl"),
            ],
          }),
        ],
      },
    });
    render(<ConsentDocumentsPage />);

    expect(await screen.findByText("Edited here")).toBeInTheDocument();
    expect(screen.getAllByText("Shipped with the app").length).toBe(3);
    expect(screen.getByText("Not written yet")).toBeInTheDocument();
  });

  it("spells out why a document is not ready, naming the languages", async () => {
    global.fetch = mockApi({
      list: {
        languages: LANGS,
        documents: [
          summary({
            ready: false,
            reasons: ["missing_languages:ja,nl", "draft_languages:de"],
          }),
        ],
      },
    });
    render(<ConsentDocumentsPage />);

    expect(await screen.findByText("Not ready")).toBeInTheDocument();
    expect(screen.getByText("Missing in: ja,nl")).toBeInTheDocument();
    expect(screen.getByText("Still a draft in: de")).toBeInTheDocument();
  });

  it("shows which studies use a document, so a live one is not edited by accident", async () => {
    global.fetch = mockApi({
      list: {
        languages: LANGS,
        documents: [
          summary({
            studies: [{ id: "s1", name: "ICU follow-up", mode: "verified" }],
          }),
        ],
      },
    });
    render(<ConsentDocumentsPage />);
    expect(await screen.findByText(/ICU follow-up/)).toBeInTheDocument();
  });

  it("renders an unknown readiness reason verbatim rather than dropping it", async () => {
    global.fetch = mockApi({
      list: {
        languages: LANGS,
        documents: [
          summary({ ready: false, reasons: ["some_future_reason:detail"] }),
        ],
      },
    });
    render(<ConsentDocumentsPage />);
    expect(
      await screen.findByText("some_future_reason: detail"),
    ).toBeInTheDocument();
  });

  it("opens the editor for one language", async () => {
    global.fetch = mockApi({});
    render(<ConsentDocumentsPage />);

    await userEvent.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(
        "Ein ausreichend langer Einwilligungstext für die Bearbeitung.",
      ),
    ).toBeInTheDocument();
  });

  it("surfaces each validation problem the API rejected the save with", async () => {
    global.fetch = mockApi({
      put: {
        ok: false,
        body: {
          error: "invalid_document",
          problems: ["placeholders_remain", "invalid_version"],
        },
      },
    });
    render(<ConsentDocumentsPage />);

    await userEvent.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(/Fill in the ⟦…⟧ placeholders before publishing/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Version must look like 1.0.0."),
    ).toBeInTheDocument();
  });

  it("offers to restore the shipped text only when an override is actually live", async () => {
    global.fetch = mockApi({ get: editable({ source: "file" }) });
    render(<ConsentDocumentsPage />);
    await userEvent.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);
    await screen.findByRole("dialog");
    expect(
      screen.queryByRole("button", { name: "Restore shipped text" }),
    ).not.toBeInTheDocument();
  });

  it("offers to restore the shipped text when the live version is a database override", async () => {
    global.fetch = mockApi({ get: editable({ source: "db" }) });
    render(<ConsentDocumentsPage />);
    await userEvent.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);
    expect(
      await screen.findByRole("button", { name: "Restore shipped text" }),
    ).toBeInTheDocument();
  });

  it("saves the edited text back to the right slug and language", async () => {
    const fetchMock = mockApi({});
    global.fetch = fetchMock;
    render(<ConsentDocumentsPage />);

    await userEvent.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
      );
      expect(put).toBeDefined();
      expect(put![0]).toContain("/admin/consent-documents/habconnect-clinical/de");
      expect(JSON.parse((put![1] as RequestInit).body as string)).toMatchObject({
        version: "1.0.0",
        status: "draft",
      });
    });
  });

  it("shows the empty state when nothing has been written yet", async () => {
    global.fetch = mockApi({ list: { languages: LANGS, documents: [] } });
    render(<ConsentDocumentsPage />);
    expect(
      await screen.findByText(/No study consent documents yet/),
    ).toBeInTheDocument();
  });
});
