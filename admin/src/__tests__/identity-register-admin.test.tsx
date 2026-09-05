import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegisterSetup } from "../app/(admin)/identity/RegisterSetup";
import { AssignmentsPanel } from "../app/(admin)/identity/AssignmentsPanel";
import { RosterImport } from "../app/(admin)/identity/RosterImport";
import { StudyMembersPanel } from "../app/(admin)/studies/StudyMembersPanel";

afterEach(() => {
  jest.resetAllMocks();
});

function mockJson(body: unknown, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  } as unknown as Response);
}

describe("RegisterSetup", () => {
  it("offers to create a register when none exists and the viewer manages", () => {
    render(
      <RegisterSetup
        token="t"
        studyId="s1"
        state={{ exists: false }}
        canManage
        onCreated={jest.fn()}
      />,
    );
    expect(screen.getByText(/No register exists/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create register" }),
    ).toBeInTheDocument();
  });

  it("does not offer creation to someone who cannot manage, and says who can", () => {
    render(
      <RegisterSetup
        token="t"
        studyId="s1"
        state={{ exists: false }}
        canManage={false}
        onCreated={jest.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Create register" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/identity-manager has to create it/)).toBeInTheDocument();
  });

  it("distinguishes 'not assigned' from 'no subjects' — the two look identical on a roster", () => {
    render(
      <RegisterSetup
        token="t"
        studyId="s1"
        state={{ exists: true, assigned: false }}
        canManage
        onCreated={jest.fn()}
      />,
    );
    expect(
      screen.getByText(/You are not assigned to this register/),
    ).toBeInTheDocument();
  });

  it("rejects a prefix that would be refused by the API, before submitting", async () => {
    render(
      <RegisterSetup
        token="t"
        studyId="s1"
        state={{ exists: false }}
        canManage
        onCreated={jest.fn()}
      />,
    );
    const input = screen.getByLabelText("Subject-code prefix");
    await userEvent.type(input, "-BAD");
    expect(screen.getByRole("button", { name: "Create register" })).toBeDisabled();
    expect(screen.getByText(/Upper-case letters, digits and dashes/)).toBeInTheDocument();
  });

  it("creates the register and reports back", async () => {
    global.fetch = mockJson({ id: "r1", subjectCodePrefix: "TUD-ICU01" });
    const onCreated = jest.fn();
    render(
      <RegisterSetup
        token="t"
        studyId="s1"
        state={{ exists: false }}
        canManage
        onCreated={onCreated}
      />,
    );
    await userEvent.type(
      screen.getByLabelText("Subject-code prefix"),
      "TUD-ICU01",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create register" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("shows the prefix once the register is ready, since codes are only traceable through it", () => {
    render(
      <RegisterSetup
        token="t"
        studyId="s1"
        state={{ exists: true, assigned: true, subjectCodePrefix: "TUD-ICU01" }}
        canManage
        onCreated={jest.fn()}
      />,
    );
    expect(screen.getByText(/TUD-ICU01-0001/)).toBeInTheDocument();
  });
});

describe("AssignmentsPanel", () => {
  it("lists who is assigned, and to what", async () => {
    global.fetch = mockJson({
      assignments: [
        { actorSub: "sub-1", role: "identity-manager", siteId: null },
        { actorSub: "sub-2", role: "study-nurse", siteId: null },
      ],
    });
    render(<AssignmentsPanel token="t" studyId="s1" canManage />);
    expect(await screen.findByText("sub-1")).toBeInTheDocument();
    // "study-nurse" is also an <option> in the role picker, so scope to the row.
    expect(
      screen.getByRole("cell", { name: "study-nurse" }),
    ).toBeInTheDocument();
  });

  it("hides the add form and remove buttons from a viewer who cannot manage", async () => {
    global.fetch = mockJson({
      assignments: [{ actorSub: "sub-1", role: "monitor", siteId: null }],
    });
    render(<AssignmentsPanel token="t" studyId="s1" canManage={false} />);
    await screen.findByText("sub-1");
    expect(screen.queryByRole("button", { name: "Assign" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("surfaces the API's own explanation for refusing to remove the last manager", async () => {
    const message =
      "This is the only identity-manager for the register. Assign another before removing this one, or nobody will be able to administer it.";
    global.fetch = jest
      .fn()
      // initial list
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          assignments: [
            { actorSub: "sub-1", role: "identity-manager", siteId: null },
          ],
        }),
      } as unknown as Response)
      // the DELETE
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: "last_manager", message }),
      } as unknown as Response);

    render(<AssignmentsPanel token="t" studyId="s1" canManage />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /only identity-manager/,
    );
  });

  it("says plainly when nobody is assigned", async () => {
    global.fetch = mockJson({ assignments: [] });
    render(<AssignmentsPanel token="t" studyId="s1" canManage />);
    expect(await screen.findByText("Nobody is assigned yet.")).toBeInTheDocument();
  });
});

describe("RosterImport", () => {
  const csv = () =>
    new File(["Vorname,Nachname\nAnna,Beispiel\n"], "roster.csv", {
      type: "text/csv",
    });

  it("renders the report by row and subject code, never repeating the uploaded data", async () => {
    global.fetch = mockJson({
      imported: 1,
      failed: 1,
      rows: [
        { row: 1, subjectCode: "TUD-0001" },
        { row: 2, error: "invalid_date_of_birth" },
      ],
    });
    render(<RosterImport token="t" studyId="s1" onImported={jest.fn()} />);
    await userEvent.upload(screen.getByLabelText("Roster CSV"), csv());

    expect(await screen.findByText(/Imported 1, failed 1/)).toBeInTheDocument();
    expect(screen.getByText("TUD-0001")).toBeInTheDocument();
    expect(screen.getByText(/failed: invalid_date_of_birth/)).toBeInTheDocument();
    // The uploaded names must never be echoed back onto the screen.
    expect(screen.queryByText(/Anna/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Beispiel/)).not.toBeInTheDocument();
  });

  it("marks a probable duplicate as imported anyway — two people can share a name and a birthday", async () => {
    global.fetch = mockJson({
      imported: 1,
      failed: 0,
      rows: [{ row: 1, subjectCode: "TUD-0002", duplicateOf: "TUD-0001" }],
    });
    render(<RosterImport token="t" studyId="s1" onImported={jest.fn()} />);
    await userEvent.upload(screen.getByLabelText("Roster CSV"), csv());
    expect(
      await screen.findByText(/possible duplicate of TUD-0001 — imported anyway/),
    ).toBeInTheDocument();
  });

  it("translates the service's terse error codes into something actionable", async () => {
    global.fetch = mockJson({ error: "csv_too_large" }, false, 400);
    render(<RosterImport token="t" studyId="s1" onImported={jest.fn()} />);
    await userEvent.upload(screen.getByLabelText("Roster CSV"), csv());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /more than 5000 rows/,
    );
  });
});

describe("StudyMembersPanel", () => {
  it("says membership is enforced on a scoped study", async () => {
    global.fetch = mockJson({ enforced: true, members: [] });
    render(<StudyMembersPanel studyId="s1" token="t" />);
    expect(await screen.findByText(/the researcher role alone grants nothing/))
      .toBeInTheDocument();
  });

  it("warns that entries have no effect yet on an open study", async () => {
    global.fetch = mockJson({ enforced: false, members: [] });
    render(<StudyMembersPanel studyId="s1" token="t" />);
    expect(
      await screen.findByText(/entries here have no effect yet/),
    ).toBeInTheDocument();
  });

  it("spells out the read/export distinction rather than showing a bare enum", async () => {
    global.fetch = mockJson({
      enforced: true,
      members: [
        {
          id: "m1",
          userId: "sub-1",
          username: "rita",
          role: "researcher",
          scope: "export",
          createdAt: "2026-09-01T00:00:00.000Z",
          createdBy: "admin-1",
        },
      ],
    });
    render(<StudyMembersPanel studyId="s1" token="t" />);
    expect(await screen.findByText("read + export")).toBeInTheDocument();
    expect(screen.getByText("rita")).toBeInTheDocument();
  });

  it("posts the new member to the study's member endpoint", async () => {
    const fetchMock = mockJson({ enforced: true, members: [] });
    global.fetch = fetchMock;
    render(<StudyMembersPanel studyId="s1" token="t" />);
    await screen.findByText(/No researchers have been given access/);

    await userEvent.type(screen.getByLabelText("Keycloak subject"), "sub-9");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      );
      expect(post).toBeDefined();
      expect(post![0]).toContain("/admin/studies/s1/members");
      expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({
        userId: "sub-9",
        role: "researcher",
        scope: "read",
      });
    });
  });
});
