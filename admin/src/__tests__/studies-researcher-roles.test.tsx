// admin/src/__tests__/studies-researcher-roles.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudiesPage from "../app/(admin)/studies/page";

let mockRoles: string[] = [];

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token", roles: mockRoles },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

const mockStudy = {
  id: "study-1",
  name: "Study A",
  description: "",
  isActive: true,
  isDefault: false,
  groups: [{ id: "g1", label: "Control", index: 1 }],
  questionnaires: [],
  participantCount: 1,
  createdAt: null,
  donationInputMode: "structured",
  structuredActivityKeys: ["walking"],
};

const mockParticipant = {
  userId: "user-1",
  groupId: "g1",
  groupLabel: "Control",
  enrolledAt: "2024-01-15T10:00:00Z",
  status: "active",
  dropoutAt: null,
};

function respond(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

beforeEach(() => {
  (global.fetch as jest.Mock) = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/export/zip")) {
      return Promise.resolve(respond({ error: "export_not_permitted" }, 403));
    }
    if (url.includes("/activity-types")) {
      return Promise.resolve(respond([{ key: "walking", label_en: "Walking", isDefault: true }]));
    }
    if (url.includes("/participants")) {
      return Promise.resolve(respond({ participants: [mockParticipant], summary: null, total: 1 }));
    }
    if (/\/admin\/studies(\?|$)/.test(url)) {
      return Promise.resolve(respond([mockStudy]));
    }
    return Promise.resolve(respond({ participants: [], summary: null, total: 0 }));
  });
});

afterEach(() => {
  jest.resetAllMocks();
});

async function openTab(name: RegExp) {
  const user = userEvent.setup();
  render(<StudiesPage />);
  await user.click(await screen.findByText("Study A"));
  await user.click(await screen.findByRole("button", { name }));
  return user;
}

describe("StudiesPage — researcher roles", () => {
  it("says why the ZIP export was refused instead of doing nothing", async () => {
    mockRoles = ["study-researcher"];
    const user = await openTab(/^participants$/i);

    await user.click(await screen.findByRole("button", { name: /export zip/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /doesn't include exporting its data/i
    );
  });

  it.each([["study-researcher"], ["researcher"]])(
    "offers a %s the activity catalog but not the shared catalog editor",
    async (role) => {
      mockRoles = [role];
      await openTab(/^habit creation$/i);

      expect(await screen.findByText("Walking")).toBeInTheDocument();
      expect(screen.queryByText(/removed from catalog/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/activity type catalog/i)).not.toBeInTheDocument();
    }
  );

  it("shows the catalog editor to an admin", async () => {
    mockRoles = ["admin"];
    await openTab(/^habit creation$/i);

    expect(await screen.findByText(/activity type catalog/i)).toBeInTheDocument();
  });
});

it.each(["researcher", "study-researcher"])(
  "lets %s start a new study while keeping infrastructure settings hidden",
  async (role) => {
    mockRoles = [role];
    const user = userEvent.setup();
    render(<StudiesPage />);
    await user.click(screen.getByRole("button", { name: /new study/i }));
    expect(screen.getAllByText(/new study/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^identity$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^knowledge/i })).not.toBeInTheDocument();
  }
);

it("shows a read-only collaborator disabled study settings", async () => {
  mockRoles = ["researcher"];
  await openTab(/^details$/i);
  expect(screen.getByText(/read-only access/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
});
