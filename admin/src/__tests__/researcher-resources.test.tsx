import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QuestionnairesPage from "../app/(admin)/questionnaires/page";
jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "research-token", roles: ["researcher"] },
    status: "authenticated",
  }),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
const studyId = "123456789012345678901234";
beforeEach(() => {
  global.fetch = jest
    .fn()
    .mockImplementation((input: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          input.includes("/studies?")
            ? { studies: [{ id: studyId, name: "Own study", canManage: true }], total: 1 }
            : input.includes("/copy?")
              ? { id: "copy" }
              : [
                  {
                    id: "template",
                    title: { en: "Shared survey" },
                    slug: "shared-survey",
                    isLibrary: true,
                    languages: ["en"],
                    questionCount: 0,
                    scope: "study",
                    version: "1",
                  },
                ],
      })
    );
});
afterEach(() => jest.resetAllMocks());
it("requires a managed study before authoring or copying a shared template", async () => {
  const user = userEvent.setup();
  render(<QuestionnairesPage />);
  await screen.findByText("Shared survey");
  expect(screen.getByRole("button", { name: "Copy to study" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Custom" }));
  expect(screen.getByRole("button", { name: /add questionnaire/i })).toBeDisabled();
  await screen.findByRole("option", { name: "Own study" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Study" }), studyId);
  expect(screen.getByRole("button", { name: /add questionnaire/i })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Library" }));
  await user.click(await screen.findByRole("button", { name: "Copy to study" }));
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/questionnaires/template/copy?studyId=${studyId}`),
      expect.objectContaining({ method: "POST" })
    )
  );
});
