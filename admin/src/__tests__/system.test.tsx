import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SystemPage from "../app/(admin)/system/page";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { accessToken: "test-token", roles: ["admin"] },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/system",
}));

type Overview = {
  generatedAt: string;
  health: {
    status: "ok" | "error";
    services: Record<string, { status: "ok" | "error"; latencyMs: number }>;
  };
  prometheus: { reachable: boolean; values: Record<string, number | null> };
};

type Queues = {
  generatedAt: string;
  queues: { name: string; counts: Record<string, number> }[];
  redis: Record<string, unknown>;
};

function makeOverview(overrides: Partial<Overview> = {}): Overview {
  return {
    generatedAt: "2026-07-12T10:00:00.000Z",
    health: {
      status: "ok",
      services: {
        mongo: { status: "ok", latencyMs: 5 },
        neo4j: { status: "ok", latencyMs: 8 },
        keycloak: { status: "ok", latencyMs: 12 },
        recommender: { status: "ok", latencyMs: 20 },
      },
    },
    prometheus: {
      reachable: true,
      values: {
        appUp: 1,
        requestsPerSec: 12.5,
        errorRatePct: 0.5,
        p95LatencyMs: 120,
        cpuPercent: 30,
        residentMemoryMB: 256,
        eventLoopLagMs: 1.2,
        heapUsedMB: 128,
      },
    },
    ...overrides,
  };
}

function makeQueues(overrides: Partial<Queues> = {}): Queues {
  return {
    generatedAt: "2026-07-12T10:00:00.000Z",
    queues: [
      {
        name: "notifications",
        counts: { waiting: 2, active: 1, completed: 100, failed: 0, delayed: 0, paused: 0 },
      },
    ],
    redis: {
      connected: true,
      usedMemoryMB: 12.3,
      keyspaceHits: 100,
      keyspaceMisses: 5,
      hitRatePct: 95,
      totalKeys: 200,
      connectedClients: 3,
      uptimeSeconds: 3600,
    },
    ...overrides,
  };
}

function mockFetchImplementation(overview: Overview, queues: Queues) {
  return jest.fn().mockImplementation((url: string) => {
    if (url.includes("/admin/system/overview")) {
      return Promise.resolve({ ok: true, json: async () => overview } as unknown as Response);
    }
    if (url.includes("/admin/system/queues")) {
      return Promise.resolve({ ok: true, json: async () => queues } as unknown as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as unknown as Response);
  });
}

beforeEach(() => {
  global.fetch = mockFetchImplementation(makeOverview(), makeQueues());
});

afterEach(() => {
  jest.resetAllMocks();
});

// Note: SystemPage auto-polls every 30s via setInterval and also refreshes on
// visibilitychange. We deliberately don't fake timers / assert the poll fires
// on schedule here — that's a timing implementation detail prone to flaking.
// The manual-refresh test below exercises the same refresh() code path.
describe("SystemPage", () => {
  it("renders without crashing", () => {
    render(<SystemPage />);
  });

  it("renders the page title", async () => {
    render(<SystemPage />);
    expect(screen.getByRole("heading", { name: /system & links/i })).toBeInTheDocument();
    await screen.findByText(/all systems operational/i);
  });

  it('status banner shows "all operational" when every service is healthy', async () => {
    render(<SystemPage />);
    expect(await screen.findByText(/all systems operational/i)).toBeInTheDocument();
  });

  it("status banner reflects an N services down state", async () => {
    const overview = makeOverview({
      health: {
        status: "error",
        services: {
          mongo: { status: "ok", latencyMs: 5 },
          neo4j: { status: "ok", latencyMs: 8 },
          keycloak: { status: "error", latencyMs: 0 },
          recommender: { status: "ok", latencyMs: 20 },
        },
      },
    });
    global.fetch = mockFetchImplementation(overview, makeQueues());
    render(<SystemPage />);

    // "MongoDB" only appears in the services grid (unlike "Keycloak", which
    // also names a tool-links card), so it's a safe anchor for "data loaded".
    await screen.findByText("MongoDB");

    // The "N services down" copy is an ICU MessageFormat plural
    // ("{count, plural, one {...} other {...}}") that the test's next-intl
    // mock doesn't expand (it only does plain {var} interpolation), so we
    // can't assert the exact rendered sentence here. Instead assert the
    // banner switched out of the "all operational" state...
    expect(screen.queryByText(/all systems operational/i)).not.toBeInTheDocument();

    // ...and that the down service is flagged as unreachable within the
    // Services card (scoped there because "Keycloak" and generic status
    // words also appear in the unrelated Tools section below).
    const servicesTitle = screen.getByText("Services");
    const servicesCard = servicesTitle.closest("div")!.parentElement as HTMLElement;
    expect(within(servicesCard).getByText("Keycloak")).toBeInTheDocument();
    expect(within(servicesCard).getByText(/unreachable · 0 ms/i)).toBeInTheDocument();
  });

  it("downstream services grid renders reachability and latency from the mocked data", async () => {
    render(<SystemPage />);
    await screen.findByText("MongoDB");

    // Scope to the Services card: "Keycloak" also names a tool-links card
    // further down the page, so an unscoped query would be ambiguous.
    const servicesTitle = screen.getByText("Services");
    const servicesCard = servicesTitle.closest("div")!.parentElement as HTMLElement;
    const withinServices = within(servicesCard);

    expect(withinServices.getByText("Neo4j")).toBeInTheDocument();
    expect(withinServices.getByText("Keycloak")).toBeInTheDocument();
    expect(withinServices.getByText("Recommender")).toBeInTheDocument();
    // latency for the mongo / keycloak service cards
    expect(withinServices.getByText(/healthy · 5 ms/i)).toBeInTheDocument();
    expect(withinServices.getByText(/healthy · 12 ms/i)).toBeInTheDocument();
  });

  it("renders performance stats from Prometheus values", async () => {
    render(<SystemPage />);
    await screen.findByText("Performance");

    expect(screen.getByText("Up")).toBeInTheDocument();
    expect(screen.getByText("12.50")).toBeInTheDocument();
    expect(screen.getByText("0.50%")).toBeInTheDocument();
    expect(screen.getByText("120 ms")).toBeInTheDocument();
    expect(screen.getByText("30.0%")).toBeInTheDocument();
    expect(screen.getByText("256 MB")).toBeInTheDocument();
    expect(screen.getByText("1.2 ms")).toBeInTheDocument();
    expect(screen.getByText("128 MB")).toBeInTheDocument();
  });

  it("shows performance as unavailable when Prometheus is unreachable", async () => {
    const overview = makeOverview({ prometheus: { reachable: false, values: {} } });
    global.fetch = mockFetchImplementation(overview, makeQueues());
    render(<SystemPage />);

    await screen.findByText("Performance");
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/prometheus is not reachable — metrics are temporarily unavailable/i)
    ).toBeInTheDocument();
  });

  it("queue pipeline stats render from the mocked queues response", async () => {
    render(<SystemPage />);
    const queueName = await screen.findByText("notifications");

    // Scope to this queue's pipeline block (pipelineName's parent) so stage
    // labels/counts are checked against the right queue, not just anywhere
    // on the page.
    const pipeline = queueName.closest("div")!.parentElement as HTMLElement;
    const withinPipeline = within(pipeline);

    expect(withinPipeline.getByText("Waiting")).toBeInTheDocument();
    expect(withinPipeline.getByText("Active")).toBeInTheDocument();
    expect(withinPipeline.getByText("Delayed")).toBeInTheDocument();
    expect(withinPipeline.getByText("Completed")).toBeInTheDocument();
    expect(withinPipeline.getByText("Failed")).toBeInTheDocument();
    expect(withinPipeline.getByText("Paused")).toBeInTheDocument();

    // waiting=2, active=1, completed=100 are each unique in this pipeline;
    // delayed/failed/paused are all 0 (three occurrences).
    expect(withinPipeline.getByText("2")).toBeInTheDocument();
    expect(withinPipeline.getByText("1")).toBeInTheDocument();
    expect(withinPipeline.getByText("100")).toBeInTheDocument();
    expect(withinPipeline.getAllByText("0")).toHaveLength(3);
  });

  it("manual refresh button re-fetches system data", async () => {
    const user = userEvent.setup();
    render(<SystemPage />);
    await screen.findByText(/all systems operational/i);

    const callsBefore = (global.fetch as jest.Mock).mock.calls.length;
    await user.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => {
      expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it("renders the 8 external tool links with the correct hrefs", async () => {
    const { container } = render(<SystemPage />);
    await screen.findByText("Tools");

    const links = Array.from(
      container.querySelectorAll('a[target="_blank"]')
    ) as HTMLAnchorElement[];
    expect(links).toHaveLength(8);

    const hrefs = links.map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "http://localhost:8080/admin/master/console/#/hhh",
      "http://grafana.localhost",
      "http://localhost:9090",
      "http://localhost:3000/queues",
      "http://localhost:5540",
      "http://localhost:7474",
      "http://localhost:8081",
      "http://localhost:3000/api-docs",
    ]);
  });
});
