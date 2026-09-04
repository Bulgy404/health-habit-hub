import { render, screen, fireEvent } from "@testing-library/react";
import {
  IdentityTab,
  type IdentityConfig,
} from "@/app/(admin)/studies/IdentityTab";

const base: IdentityConfig = {
  mode: "anonymous",
  subjectCodePrefix: null,
  verificationMethods: ["in_person"],
  consentDocumentSlug: null,
  reidentificationApprovers: 1,
  revealTtlMinutes: 60,
  auditReads: true,
  researcherScoping: "open",
};

function setup(value: Partial<IdentityConfig> = {}, hasEnrolments = false) {
  const onChange = jest.fn();
  render(
    <IdentityTab
      value={{ ...base, ...value }}
      hasEnrolments={hasEnrolments}
      onChange={onChange}
    />,
  );
  return { onChange };
}

describe("IdentityTab", () => {
  it("is off by default and requires an explicit acknowledgement to enable", () => {
    // Turning this on starts collecting participant identities. It should not
    // be a single stray click.
    setup();
    const toggle = screen.getByLabelText(/Verified identity mode/i);
    expect(toggle).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/I understand this study will collect/i));
    expect(screen.getByLabelText(/Verified identity mode/i)).toBeEnabled();
  });

  it("hides the configuration until the mode is on", () => {
    setup();
    expect(screen.queryByLabelText(/Subject-code prefix/i)).toBeNull();
  });

  it("LOCKS mode and prefix once anyone has enrolled", () => {
    // Switching to anonymous would orphan live identity links; changing the
    // prefix would break the correspondence to the register.
    setup({ mode: "verified", subjectCodePrefix: "TUD-DFG01" }, true);
    expect(screen.getByLabelText(/Verified identity mode/i)).toBeDisabled();
    expect(screen.getByLabelText(/Subject-code prefix/i)).toBeDisabled();
    expect(screen.getByRole("note")).toHaveTextContent(/locked/i);
  });

  it("leaves the other settings editable after enrolment", () => {
    const { onChange } = setup(
      { mode: "verified", subjectCodePrefix: "TUD-DFG01" },
      true,
    );
    fireEvent.change(screen.getByLabelText(/Reveal window/i), {
      target: { value: "30" },
    });
    expect(onChange).toHaveBeenCalledWith({ revealTtlMinutes: 30 });
  });

  it("warns that a consent slug needs a matching document", () => {
    // A slug with no document 404s the participant after they have already
    // enrolled — the worst possible moment to discover it.
    setup({ mode: "verified" });
    expect(
      screen.getByText(/A document must exist at/i),
    ).toBeInTheDocument();
  });

  it("explains the operational cost of two approvers", () => {
    setup({ mode: "verified" });
    expect(
      screen.getByText(/needs two people awake/i),
    ).toBeInTheDocument();
  });

  it("uppercases the prefix so it matches the stored format", () => {
    const { onChange } = setup({ mode: "verified" });
    fireEvent.change(screen.getByLabelText(/Subject-code prefix/i), {
      target: { value: "tud-dfg01" },
    });
    expect(onChange).toHaveBeenCalledWith({ subjectCodePrefix: "TUD-DFG01" });
  });
});
