import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnalyticsInsightsPage from "../app/(admin)/analytics/page";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token", roles: ["admin"] },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/analytics",
}));

function makeStudy(overrides: Record<string, unknown> = {}) {
  return {
    id: "study-1",
    name: "Study A",
    groups: [{ id: "g1", label: "Group 1", index: 0 }],
    participantCount: 1,
    isActive: true,
    ...overrides,
  };
}

const mockParticipant = {
  userId: "u1",
  username: "p-u1",
  group: "g1",
  enrolledAt: "2026-01-01T00:00:00.000Z",
  lastActive: "2026-01-05T00:00:00.000Z",
  surveyCompletionPct: 0.5,
  droppedOutAt: null,
};

const mockAnalytics = {
  weeklyActiveRate: [{ groupId: "g1", enrolled: 10, active: 7, rate: 0.7 }],
  srhiTrajectory: [{ groupId: "g1", weekNumber: 1, meanScore: 5, count: 10 }],
  dropoutCurve: [],
  questionnaireCompletionRates: [],
  enrollmentTrend: [],
  dailyActive: [],
  habitsByGroup: [],
  engagement: {
    totalHabits: 5,
    totalLogs: 20,
    totalIntentions: 3,
    avgLogsPerActive: 2,
    avgIntentionsPerParticipant: 1,
  },
};

const mockProgress = {
  profile: { completed: true, completedAt: "2026-01-02T00:00:00.000Z" },
  surveys: [],
  habitsCount: 2,
  recommendations: { accepted: 1, dismissed: 0 },
  timeline: [],
};

// Mocks every endpoint AnalyticsView touches: study list, per-study analytics,
// per-study participants, and the two per-participant drawer fetches.
function mockFetchImplementation() {
  return jest.fn().mockImplementation((url: string) => {
    if (url.includes("/admin/studies?limit=100")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ studies: [makeStudy()] }),
      } as unknown as Response);
    }
    if (url.includes("/reminder-plans")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ plans: [] }),
      } as unknown as Response);
    }
    if (url.includes("/progress")) {
      return Promise.resolve({
        ok: true,
        json: async () => mockProgress,
      } as unknown as Response);
    }
    if (url.includes("/participants?limit=500")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ participants: [mockParticipant] }),
      } as unknown as Response);
    }
    if (url.includes("/analytics")) {
      return Promise.resolve({
        ok: true,
        json: async () => mockAnalytics,
      } as unknown as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as unknown as Response);
  });
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ studies: [] }),
  } as unknown as Response);
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("AnalyticsInsightsPage", () => {
  it("renders without crashing", () => {
    render(<AnalyticsInsightsPage />);
  });

  it("renders the page title", async () => {
    render(<AnalyticsInsightsPage />);
    expect(await screen.findByRole("heading", { name: /^analytics$/i })).toBeInTheDocument();
  });

  it("study-selector dropdown populates from a mocked studies fetch", async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes("/admin/studies?limit=100")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            studies: [
              makeStudy({ id: "s1", name: "Study One" }),
              makeStudy({ id: "s2", name: "Study Two", isActive: false }),
            ],
          }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as unknown as Response);
    });

    render(<AnalyticsInsightsPage />);

    expect(await screen.findByRole("option", { name: "Study One" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Study Two (inactive)" })).toBeInTheDocument();
  });

  it('shows the "select a study" prompt when no study is selected', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ studies: [] }),
    } as unknown as Response);

    render(<AnalyticsInsightsPage />);

    expect(await screen.findByText(/select a study above to see analytics/i)).toBeInTheDocument();
  });

  it("KPI cards render with mocked data after selecting a study", async () => {
    const user = userEvent.setup();
    global.fetch = mockFetchImplementation();

    render(<AnalyticsInsightsPage />);

    // Study auto-selects (single active study); explicitly re-select it too,
    // exercising the dropdown's onChange handler.
    const select = await screen.findByRole("combobox");
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe("study-1"));
    await user.selectOptions(select, "study-1");

    expect(await screen.findByText("Total enrolled")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Active (last 7 days)")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("clicking a participant table row opens the detail drawer and it closes again", async () => {
    const user = userEvent.setup();
    global.fetch = mockFetchImplementation();

    render(<AnalyticsInsightsPage />);

    const row = await screen.findByText("p-u1");
    await user.click(row);

    expect(await screen.findByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Habits")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "×" }));

    await waitFor(() => {
      expect(screen.queryByText("Summary")).not.toBeInTheDocument();
    });
  });

  it("shows a loading state while the analytics fetch is pending", async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes("/admin/studies?limit=100")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ studies: [makeStudy()] }),
        } as unknown as Response);
      }
      // Never resolves — keeps the page in its analytics-loading state.
      return new Promise(() => {});
    });

    render(<AnalyticsInsightsPage />);

    expect(await screen.findByText(/loading analytics/i)).toBeInTheDocument();
  });
});
