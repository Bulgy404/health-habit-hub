import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CuePoolsPage from "../app/(admin)/cue-pools/page";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token" },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/cue-pools",
}));

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ total: 0, page: 1, limit: 50, cues: [] }),
  } as unknown as Response);
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("CuePoolsPage", () => {
  it("renders without crashing", () => {
    render(<CuePoolsPage />);
  });

  it("renders the page title", () => {
    render(<CuePoolsPage />);
    expect(screen.getByRole("heading", { name: /cue pools/i })).toBeInTheDocument();
  });

  it("shows empty state when no cues", async () => {
    render(<CuePoolsPage />);
    expect(await screen.findByText(/no cues yet/i)).toBeInTheDocument();
  });

  it("renders the Import CSV button", () => {
    render(<CuePoolsPage />);
    expect(screen.getByRole("button", { name: /import csv/i })).toBeInTheDocument();
  });

  it("shows a cue's text (resolved) and its available languages", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        total: 1,
        page: 1,
        limit: 50,
        cues: [
          {
            id: "c1",
            text: { en: "After dinner", de: "Nach dem Abendessen" },
            languages: ["en", "de"],
            quality: "high",
            dimensions: { stability: 3, salience: 3, specificity: 3 },
            domain: "physical_activity",
            createdAt: null,
          },
        ],
      }),
    } as unknown as Response);

    render(<CuePoolsPage />);

    expect(await screen.findByText("After dinner")).toBeInTheDocument();
    expect(screen.getByText("EN, DE")).toBeInTheDocument();
  });

  it("creating a cue with multiple languages sends a locale-map payload", async () => {
    const user = userEvent.setup();
    render(<CuePoolsPage />);

    await user.click(screen.getByRole("button", { name: /add cue/i }));

    const textInput = screen.getByPlaceholderText(/after dinner each evening/i);
    await user.type(textInput, "Walk after lunch");

    await user.click(screen.getByRole("switch", { name: /deutsch/i }));
    await user.click(screen.getByRole("button", { name: /editing: deutsch/i }));
    await user.type(textInput, "Nach dem Mittagessen spazieren");

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: "new-id" }),
    } as unknown as Response);

    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      const postCall = (global.fetch as jest.Mock).mock.calls.find((c) => c[1]?.method === "POST");
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall![1].body);
      expect(body.text).toEqual({
        en: "Walk after lunch",
        de: "Nach dem Mittagessen spazieren",
      });
      expect(body.languages.sort()).toEqual(["de", "en"]);
      expect(body.dimensions).toEqual({ stability: 3, salience: 3, specificity: 3 });
    });
  });

  it("CSV import rejects a file missing a text_<lang> column", async () => {
    const user = userEvent.setup();
    render(<CuePoolsPage />);

    const csvContent = "quality,stability,salience,specificity,domain\nhigh,3,3,3,exercise\n";
    const file = new File([csvContent], "cues.csv", { type: "text/csv" });
    // jsdom's File doesn't implement Blob.text() — polyfill for this test.
    file.text = async () => csvContent;
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    expect(await screen.findByText(/missing columns/i)).toBeInTheDocument();
  });
});
