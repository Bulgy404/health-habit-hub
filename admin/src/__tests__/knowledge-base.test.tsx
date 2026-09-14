import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KnowledgeBasePage from "../app/(admin)/knowledge-base/page";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token", roles: ["admin"] },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

describe("KnowledgeBasePage", () => {
  // Mock fetch so the page doesn't error on mount
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([]),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("renders without crashing", () => {
    render(<KnowledgeBasePage />);
  });

  it("renders the page title", () => {
    render(<KnowledgeBasePage />);
    expect(screen.getByRole("heading", { name: /knowledge base/i })).toBeInTheDocument();
  });

  it("renders Upload Document button", () => {
    render(<KnowledgeBasePage />);
    expect(screen.getByRole("button", { name: /upload document/i })).toBeInTheDocument();
  });

  it("renders View Graph link", () => {
    render(<KnowledgeBasePage />);
    expect(screen.getByRole("link", { name: /view graph/i })).toBeInTheDocument();
  });

  it('opens upload modal when "Upload Document" button is clicked', async () => {
    const user = userEvent.setup();
    render(<KnowledgeBasePage />);

    await user.click(screen.getByRole("button", { name: /upload document/i }));

    // Modal title should appear
    expect(screen.getByText("Upload PDF", { selector: "span" })).toBeInTheDocument();
  });

  it("shows delete confirmation dialog when Delete is clicked on a file", async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([
        {
          filename: "test-paper.pdf",
          category: "general",
          file_size: 12345,
          has_summary: false,
          upload_date: "2024-01-01T00:00:00Z",
        },
      ]),
    } as unknown as Response);

    render(<KnowledgeBasePage />);

    // Wait for the file entry to appear
    await screen.findByText("test-paper.pdf");

    // Click Delete
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    // Confirm dialog should appear
    expect(screen.getByText(/delete file\?/i)).toBeInTheDocument();
  });

  it("rejects non-PDF files with an error message", async () => {
    const user = userEvent.setup();
    const { container } = render(<KnowledgeBasePage />);

    // Open the upload modal
    await user.click(screen.getByRole("button", { name: /upload document/i }));

    // jsdom's file input is read-only; override `files` on the DOM element via Object.defineProperty
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["content"], "test.xlsx", { type: "application/vnd.ms-excel" });
    const fileList = {
      0: file,
      length: 1,
      item: (i: number) => (i === 0 ? file : null),
      [Symbol.iterator]: function* () {
        yield file;
      },
    };
    Object.defineProperty(fileInput, "files", {
      value: fileList,
      writable: false,
      configurable: true,
    });
    fireEvent.change(fileInput);

    // Click the Upload button inside the modal
    await user.click(screen.getByRole("button", { name: /^upload$/i }));

    // Error should appear
    await waitFor(() => {
      expect(screen.getByText(/only pdf, txt, and md files are accepted/i)).toBeInTheDocument();
    });
  });
});

describe("KnowledgeBasePage — citations", () => {
  const PAPER = {
    filename: "Elsheikh et al. - 2025 - Exploring fear.pdf",
    category: "general",
    file_size: 1024,
    has_summary: true,
    upload_date: "2026-09-01T00:00:00.000Z",
    citation: "Elsheikh et al. (2025) — Exploring Fear",
    url: "https://doi.org/10.3389/frobt.2025.1626471",
    has_reference: true,
  };

  function mockKb(entries: unknown[]) {
    return jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(entries),
    } as unknown as Response);
  }

  afterEach(() => jest.resetAllMocks());

  it("shows the citation as a DOI link rather than a bare filename", async () => {
    global.fetch = mockKb([PAPER]);
    render(<KnowledgeBasePage />);

    const link = await screen.findByRole("link", {
      name: /Elsheikh et al\. \(2025\)/,
    });
    expect(link).toHaveAttribute("href", PAPER.url);
  });

  it("flags a paper that has no BibLaTeX entry yet", async () => {
    // Without this the paper looks indexed and fine, and the missing citation
    // only shows up as a bare filename in a participant-facing source list.
    global.fetch = mockKb([
      { ...PAPER, citation: "Exploring fear", url: "", has_reference: false },
    ]);
    render(<KnowledgeBasePage />);

    expect(await screen.findByText(/No BibLaTeX entry/i)).toBeInTheDocument();
  });

  it("sends the pasted BibLaTeX entry with the upload", async () => {
    const user = userEvent.setup();
    const fetchMock = mockKb([]);
    global.fetch = fetchMock;
    render(<KnowledgeBasePage />);

    await user.click(screen.getByRole("button", { name: /upload document/i }));

    const file = new File(["%PDF-1.4"], "paper.pdf", { type: "application/pdf" });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);
    // paste, not type: userEvent reads {...} in typed text as keyboard
    // descriptors, and pasting is what an admin actually does here.
    await user.click(screen.getByLabelText(/BibLaTeX entry/i));
    await user.paste("@article{k, title = {T}, author = {Wood, W.}, date = {2016}}");
    await user.click(screen.getByRole("button", { name: /^upload$/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      );
      expect(post).toBeDefined();
      const body = (post![1] as RequestInit).body as FormData;
      expect(body.get("bibtex")).toContain("@article");
      expect(body.get("file")).toBeTruthy();
    });
  });

  it("surfaces the parser's complaint when the entry cannot be read", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockImplementation(async (_url, init) => {
      if ((init as RequestInit | undefined)?.method === "POST") {
        return {
          ok: false,
          status: 400,
          json: async () => ({ detail: "Could not find a BibLaTeX entry" }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => [],
      } as unknown as Response;
    });
    render(<KnowledgeBasePage />);

    await user.click(screen.getByRole("button", { name: /upload document/i }));
    const file = new File(["%PDF-1.4"], "paper.pdf", { type: "application/pdf" });
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      file,
    );
    await user.type(screen.getByLabelText(/BibLaTeX entry/i), "nonsense");
    await user.click(screen.getByRole("button", { name: /^upload$/i }));

    expect(
      await screen.findByText(/Could not find a BibLaTeX entry/i),
    ).toBeInTheDocument();
  });
});
