import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DonationsPage from "../app/(admin)/donations/page";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token", roles: ["admin"] },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/donations",
}));

const donation1 = {
  _id: "d1",
  participantId: "p-1",
  habitName: "Morning walk",
  category: "Physical activity",
  group: "G1",
  donatedAt: "2026-01-05T00:00:00.000Z",
};

function mockFetchImplementation(overrides: { total?: number; results?: unknown[] } = {}) {
  return jest.fn().mockImplementation((url: string) => {
    if (url.includes("/admin/habits/categories")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ categories: ["Physical activity", "Sleep"] }),
      } as unknown as Response);
    }
    if (url.includes("/admin/habits/feed/export")) {
      return Promise.resolve({
        ok: true,
        blob: async () => new Blob(["id,habit\n"], { type: "text/csv" }),
      } as unknown as Response);
    }
    if (url.includes("/admin/habits/feed")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          total: overrides.total ?? 1,
          page: 1,
          limit: 50,
          results: overrides.results ?? [donation1],
        }),
      } as unknown as Response);
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

describe("DonationsPage", () => {
  it("renders without crashing", () => {
    render(<DonationsPage />);
  });

  it("renders the page title", async () => {
    render(<DonationsPage />);
    expect(screen.getByRole("heading", { name: /habit donations/i })).toBeInTheDocument();
    await screen.findByText("Morning walk");
  });

  it("filtering by group updates the fetch query params", async () => {
    const user = userEvent.setup();
    const { container } = render(<DonationsPage />);
    await screen.findByText("Morning walk");

    const groupSelect = container.querySelectorAll("select")[0] as HTMLSelectElement;
    await user.selectOptions(groupSelect, "G2");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("group=G2"),
        expect.anything()
      );
    });
  });

  it("filtering by category updates the fetch query params", async () => {
    const user = userEvent.setup();
    const { container } = render(<DonationsPage />);
    await screen.findByText("Morning walk");

    // The category dropdown is populated from /admin/habits/categories.
    await screen.findByRole("option", { name: "Physical activity" });
    const categorySelect = container.querySelectorAll("select")[1] as HTMLSelectElement;
    await user.selectOptions(categorySelect, "Physical activity");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("category=Physical+activity"),
        expect.anything()
      );
    });
  });

  it("filtering by date range updates the fetch query params", async () => {
    const { container } = render(<DonationsPage />);
    await screen.findByText("Morning walk");

    const [dateFrom, dateTo] = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateFrom, { target: { value: "2026-01-01" } });
    fireEvent.change(dateTo, { target: { value: "2026-01-31" } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("dateFrom=2026-01-01"),
        expect.anything()
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("dateTo=2026-01-31"),
        expect.anything()
      );
    });
  });

  it('"Export CSV" button triggers a request to the export endpoint', async () => {
    const user = userEvent.setup();
    render(<DonationsPage />);
    await screen.findByText("Morning walk");

    await user.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/admin/habits/feed/export"),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) })
      );
    });
    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it("pagination controls page through results and re-fetch with the new page", async () => {
    (global.fetch as jest.Mock) = mockFetchImplementation({ total: 120 });
    const user = userEvent.setup();
    render(<DonationsPage />);
    await screen.findByText("Morning walk");

    expect(screen.getByText("120 total · page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^next$/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("page=2"),
        expect.anything()
      );
    });
  });

  it("shows the empty state when no donations match the filters", async () => {
    (global.fetch as jest.Mock) = mockFetchImplementation({ total: 0, results: [] });
    render(<DonationsPage />);
    expect(await screen.findByText(/no donations match these filters/i)).toBeInTheDocument();
  });
});
