// admin/src/__tests__/profile-fields.test.tsx
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfileFieldsPage from "../app/(admin)/profile-fields/page";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token", roles: ["admin"] },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/profile-fields",
}));

const mockField = {
  fieldId: "age",
  label: "Age",
  type: "number",
  options: [],
  required: false,
  order: 0,
};

afterEach(() => {
  jest.resetAllMocks();
});

describe("ProfileFieldsPage", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([]),
    } as unknown as Response);
  });

  it("renders without crashing", () => {
    render(<ProfileFieldsPage />);
  });

  it("renders the page heading", () => {
    render(<ProfileFieldsPage />);
    expect(screen.getByRole("heading", { name: /profile fields/i })).toBeInTheDocument();
  });

  it("shows empty state when no fields exist", async () => {
    render(<ProfileFieldsPage />);
    expect(await screen.findByText(/no profile fields defined/i)).toBeInTheDocument();
  });

  it("renders the Add Field button", () => {
    render(<ProfileFieldsPage />);
    expect(screen.getByRole("button", { name: /add field/i })).toBeInTheDocument();
  });

  it("opens the create form when Add Field is clicked", async () => {
    const user = userEvent.setup();
    render(<ProfileFieldsPage />);

    await user.click(screen.getByRole("button", { name: /add field/i }));

    // Form opens — Cancel and Create buttons appear
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create/i })).toBeInTheDocument();
  });

  it("shows existing fields loaded from API", async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([mockField]),
    } as unknown as Response);

    render(<ProfileFieldsPage />);

    expect(await screen.findByText("Age")).toBeInTheDocument();
    expect(await screen.findByText("age")).toBeInTheDocument();
  });

  it("shows error when API returns non-ok response", async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ error: "Internal server error" }),
    } as unknown as Response);

    render(<ProfileFieldsPage />);

    await waitFor(() => {
      expect(screen.getByText(/internal server error/i)).toBeInTheDocument();
    });
  });
});
