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

const mockLibraryField = {
  fieldId: "gender",
  label: { en: "Gender", de: "Geschlecht" },
  type: "select",
  options: [
    { value: "male", label: { en: "Male", de: "Männlich" } },
    { value: "female", label: { en: "Female", de: "Weiblich" } },
  ],
  languages: ["en", "de"],
  required: false,
  order: 0,
  isLibrary: true,
};

const mockCustomField = {
  fieldId: "height",
  label: { en: "Height" },
  type: "number",
  options: [],
  languages: ["en"],
  required: false,
  order: 1,
  isLibrary: false,
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

  it("renders Library and Custom tabs", () => {
    render(<ProfileFieldsPage />);
    expect(screen.getByRole("button", { name: /library/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /custom/i })).toBeInTheDocument();
  });

  it('"Add Field" button is absent on Library tab and present on Custom tab', async () => {
    const user = userEvent.setup();
    render(<ProfileFieldsPage />);

    expect(screen.queryByRole("button", { name: /add field/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^custom$/i }));

    expect(screen.getByRole("button", { name: /add field/i })).toBeInTheDocument();
  });

  it("shows empty state on Custom tab when no custom fields exist", async () => {
    const user = userEvent.setup();
    render(<ProfileFieldsPage />);
    await user.click(screen.getByRole("button", { name: /^custom$/i }));
    expect(await screen.findByText(/no custom profile fields yet/i)).toBeInTheDocument();
  });

  it("shows library fields on the Library tab with a Preview action", async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([mockLibraryField]),
    } as unknown as Response);

    render(<ProfileFieldsPage />);

    expect(await screen.findByText("Gender")).toBeInTheDocument();
    expect(screen.getByText("gender")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /preview/i })).toBeInTheDocument();
  });

  it("shows custom fields on the Custom tab with Edit/Delete actions", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([mockCustomField]),
    } as unknown as Response);

    render(<ProfileFieldsPage />);
    await user.click(screen.getByRole("button", { name: /^custom$/i }));

    expect(await screen.findByText("Height")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
  });

  it("opens the create form when Add Field is clicked", async () => {
    const user = userEvent.setup();
    render(<ProfileFieldsPage />);

    await user.click(screen.getByRole("button", { name: /^custom$/i }));
    await user.click(screen.getByRole("button", { name: /add field/i }));

    expect(screen.getByText("Add Field", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^create$/i })).toBeInTheDocument();
  });

  it("entering a label per language and saving sends a locale-map payload", async () => {
    const user = userEvent.setup();
    render(<ProfileFieldsPage />);

    await user.click(screen.getByRole("button", { name: /^custom$/i }));
    await user.click(screen.getByRole("button", { name: /add field/i }));

    await user.type(screen.getByPlaceholderText(/lowercase, underscores only/i), "shoe_size");
    const labelInput = screen.getByPlaceholderText(/shown to the user/i);
    await user.type(labelInput, "Shoe size");

    await user.click(screen.getByRole("switch", { name: /deutsch/i }));
    await user.click(screen.getByRole("button", { name: /editing: deutsch/i }));
    await user.type(labelInput, "Schuhgröße");

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as Response);

    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      const postCall = (global.fetch as jest.Mock).mock.calls.find((c) => c[1]?.method === "POST");
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall![1].body);
      expect(body.fieldId).toBe("shoe_size");
      expect(body.label).toEqual({ en: "Shoe size", de: "Schuhgröße" });
      expect(body.languages.sort()).toEqual(["de", "en"]);
    });
  });

  it("shows delete confirm dialog when Delete is clicked on a custom field", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([mockCustomField]),
    } as unknown as Response);

    render(<ProfileFieldsPage />);
    await user.click(screen.getByRole("button", { name: /^custom$/i }));
    await screen.findByText("Height");

    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(screen.getByText(/delete profile field\?/i)).toBeInTheDocument();
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
