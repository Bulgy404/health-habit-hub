import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudiesPage from "../app/(admin)/studies/page";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token" },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

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

const mockStudy = {
  id: "study-1",
  name: "Study A",
  description: "",
  isActive: true,
  isDefault: false,
  recommenderEnabled: true,
  groups: [],
  questionnaires: [],
  participantCount: 0,
  createdAt: null,
};

describe("StudiesPage", () => {
  it("renders without crashing", () => {
    render(<StudiesPage />);
  });

  it("renders the page title", () => {
    render(<StudiesPage />);
    expect(screen.getByRole("heading", { name: /studies/i })).toBeInTheDocument();
  });

  it("detail modal tabs are reachable — Codes tab visible and clickable", async () => {
    const user = userEvent.setup();

    // First call: list load returns one study
    // Subsequent calls (codes fetch inside CodesTab): return empty codes list
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([mockStudy]),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ codes: [], total: 0 }),
      } as unknown as Response);

    render(<StudiesPage />);

    // Wait for study to appear and click its row to open detail modal
    const studyName = await screen.findByText("Study A");
    await user.click(studyName);

    // Modal should open — Codes tab button should be visible
    const codesTab = await screen.findByRole("button", { name: /^codes$/i });
    expect(codesTab).toBeInTheDocument();

    // Click Codes tab
    await user.click(codesTab);

    // The Generate study codes section heading should appear
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /generate study codes/i })).toBeInTheDocument();
    });
  });

  it("Codes tab generate form submits without requiring a group (study-level codes)", async () => {
    const user = userEvent.setup();

    // Study-level codes don't require a group — auto-assigned at redemption.
    const studyNoGroups = { ...mockStudy, groups: [] };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([studyNoGroups]),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ codes: [], total: 0 }),
      } as unknown as Response);

    render(<StudiesPage />);

    // Open detail modal
    const studyName = await screen.findByText("Study A");
    await user.click(studyName);

    // Switch to Codes tab
    const codesTab = await screen.findByRole("button", { name: /^codes$/i });
    await user.click(codesTab);

    // Wait for Generate codes button and click it — no group selection needed
    const generateBtn = await screen.findByRole("button", { name: /^generate codes$/i });
    await user.click(generateBtn);

    // No error should appear; button should return to its default label
    await waitFor(() => {
      expect(screen.queryByText(/please select a group/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^generate codes$/i })).toBeInTheDocument();
    });
  });

  it("Reminders tab: habit reminder — enabling then fixing the time reveals a time input, and saving PUTs the study-level reminders config", async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([mockStudy]),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ ok: true }),
      } as unknown as Response);

    render(<StudiesPage />);

    const studyName = await screen.findByText("Study A");
    await user.click(studyName);

    const remindersTab = await screen.findByRole("button", { name: /^reminders$/i });
    await user.click(remindersTab);

    const habitSection = await screen.findByTestId("reminder-section-habit");

    // Off by default (no stored reminders on mockStudy) — no time input yet.
    expect(within(habitSection).queryByDisplayValue("09:00")).not.toBeInTheDocument();

    // First switch enables the reminder (participant-choice — no time input
    // yet, since the participant would pick their own).
    await user.click(within(habitSection).getByRole("switch", { name: "Reminder enabled" }));
    expect(within(habitSection).queryByDisplayValue("09:00")).not.toBeInTheDocument();

    // Second switch locks it to an admin-fixed time — this is the mode/time
    // behavior the feature adds on top of the old single enabled/hour toggle.
    await user.click(within(habitSection).getByRole("switch", { name: "Admin fixes the time" }));
    expect(within(habitSection).getByDisplayValue("09:00")).toBeInTheDocument();

    // Save triggers a PUT with just this type's reminders payload (each
    // reminder type has its own dedicated save button).
    await user.click(within(habitSection).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const putCall = (global.fetch as jest.Mock).mock.calls.find(
        (call) => call[1]?.method === "PUT"
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall![1].body);
      expect(body.reminders.habit).toEqual({ mode: "admin_fixed", time: "09:00" });
    });
  });

  it("Reminders tab: study update — setting a time creates a recurring notification campaign on save", async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([mockStudy]),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: "campaign-1" }),
      } as unknown as Response);

    render(<StudiesPage />);

    const studyName = await screen.findByText("Study A");
    await user.click(studyName);

    const remindersTab = await screen.findByRole("button", { name: /^reminders$/i });
    await user.click(remindersTab);

    const studyUpdateSection = await screen.findByTestId("reminder-section-studyUpdate");
    await user.click(within(studyUpdateSection).getByRole("switch", { name: "Set a time" }));

    await user.click(within(studyUpdateSection).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const postCall = (global.fetch as jest.Mock).mock.calls.find(
        (call) =>
          call[1]?.method === "POST" &&
          typeof call[0] === "string" &&
          call[0].includes("/admin/notifications")
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall![1].body);
      expect(body.studyId).toBe("study-1");
      expect(body.targetType).toBe("all_enrolled");
      expect(body.recurrence).toEqual({ intervalDays: 7 });
      expect(body.scheduledFor).toBeTruthy();
    });
  });

  it("Reminders tab: switching a type to per-group scope shows one editor per group", async () => {
    const user = userEvent.setup();
    const studyWithGroups = {
      ...mockStudy,
      groups: [
        { id: "g1", label: "Control", index: 1 },
        { id: "g2", label: "Intervention", index: 2 },
      ],
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([studyWithGroups]),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ ok: true }),
      } as unknown as Response);

    render(<StudiesPage />);

    const studyName = await screen.findByText("Study A");
    await user.click(studyName);

    const remindersTab = await screen.findByRole("button", { name: /^reminders$/i });
    await user.click(remindersTab);

    const habitSection = await screen.findByTestId("reminder-section-habit");

    // Study-wide by default: exactly one "Reminder enabled" switch, no group
    // labels rendered.
    expect(within(habitSection).getAllByRole("switch", { name: "Reminder enabled" })).toHaveLength(
      1
    );
    expect(within(habitSection).queryByText("Control")).not.toBeInTheDocument();

    await user.click(within(habitSection).getByRole("switch", { name: "Configure per group" }));

    // Per-group scope: one editor per group, each independently switchable.
    expect(within(habitSection).getByText("Control")).toBeInTheDocument();
    expect(within(habitSection).getByText("Intervention")).toBeInTheDocument();
    expect(within(habitSection).getAllByRole("switch", { name: "Reminder enabled" })).toHaveLength(
      2
    );
  });
});
