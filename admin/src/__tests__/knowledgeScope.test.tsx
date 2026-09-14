import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KnowledgeScopePanel } from "../app/(admin)/studies/KnowledgeScopePanel";

const PAPERS = [
  { filename: "wood-2016.pdf", citation: "Wood (2016) — Psychology of Habit", has_reference: true },
  { filename: "gardner-2012.pdf", citation: "Gardner (2012) — Habit as process", has_reference: true },
];

function mockApi() {
  return jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => PAPERS } as unknown as Response;
  });
}

function savedBody(fetchMock: jest.Mock) {
  const put = fetchMock.mock.calls.find(
    ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
  );
  expect(put).toBeDefined();
  return JSON.parse((put![1] as RequestInit).body as string);
}

afterEach(() => jest.resetAllMocks());

describe("KnowledgeScopePanel", () => {
  it("a study with no selection is on 'every paper', not an empty list", async () => {
    global.fetch = mockApi();
    render(
      <KnowledgeScopePanel
        studyId="s1"
        token="t"
        initialFiles={null}
        isDefaultStudy={false}
      />,
    );
    expect(
      await screen.findByRole("radio", { name: /use every paper/i }),
    ).toBeChecked();
  });

  it("saves null for 'every paper', so papers uploaded later are included too", async () => {
    // The distinction this pins down: were "everything" stored as a list of
    // today's filenames, a paper uploaded next month would silently never
    // reach this study.
    const user = userEvent.setup();
    const fetchMock = mockApi();
    global.fetch = fetchMock;
    render(
      <KnowledgeScopePanel
        studyId="s1"
        token="t"
        initialFiles={["wood-2016.pdf"]}
        isDefaultStudy={false}
      />,
    );

    await user.click(await screen.findByRole("radio", { name: /use every paper/i }));
    await user.click(screen.getByRole("button", { name: /save selection/i }));

    await waitFor(() => {
      expect(savedBody(fetchMock)).toEqual({ knowledgeBaseFiles: null });
    });
  });

  it("saves exactly the papers that were ticked", async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi();
    global.fetch = fetchMock;
    render(
      <KnowledgeScopePanel
        studyId="s1"
        token="t"
        initialFiles={[]}
        isDefaultStudy={false}
      />,
    );

    await user.click(await screen.findByRole("checkbox", { name: /Wood \(2016\)/ }));
    await user.click(screen.getByRole("button", { name: /save selection/i }));

    await waitFor(() => {
      expect(savedBody(fetchMock)).toEqual({
        knowledgeBaseFiles: ["wood-2016.pdf"],
      });
    });
  });

  it("says plainly that an empty selection means no papers at all", async () => {
    // It is a coherent instruction, and almost always a half-finished one.
    global.fetch = mockApi();
    render(
      <KnowledgeScopePanel
        studyId="s1"
        token="t"
        initialFiles={[]}
        isDefaultStudy={false}
      />,
    );
    expect(
      await screen.findByText(/draw on no papers at all/i),
    ).toBeInTheDocument();
  });

  it("tells the general study that it normally uses everything", async () => {
    global.fetch = mockApi();
    render(
      <KnowledgeScopePanel
        studyId="s1"
        token="t"
        initialFiles={null}
        isDefaultStudy
      />,
    );
    expect(
      await screen.findByText(/this is the general study/i),
    ).toBeInTheDocument();
  });

  it("filters a long list rather than making the admin scroll it", async () => {
    const user = userEvent.setup();
    global.fetch = mockApi();
    render(
      <KnowledgeScopePanel
        studyId="s1"
        token="t"
        initialFiles={[]}
        isDefaultStudy={false}
      />,
    );

    await screen.findByRole("checkbox", { name: /Wood \(2016\)/ });
    await user.type(screen.getByLabelText(/filter papers/i), "gardner");

    expect(screen.queryByRole("checkbox", { name: /Wood \(2016\)/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Gardner \(2012\)/ })).toBeInTheDocument();
  });
});
