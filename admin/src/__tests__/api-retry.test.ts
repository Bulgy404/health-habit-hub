/**
 * Tests for the 401 refresh-and-retry behaviour of the real `apiFetch` helper
 * (src/lib/api.ts).
 *
 * When a Keycloak access token expires while the admin tab stays open, the
 * backend answers 401. apiFetch must force a session refresh (via NextAuth's
 * getSession, which re-issues the token server-side) and retry once with the
 * fresh token — instead of surfacing a spurious "unauthorized" error that only
 * a manual page reload would clear.
 */

import { apiFetch } from "@/lib/api";

const mockGetSession = jest.fn();
jest.mock("next-auth/react", () => ({
  getSession: () => mockGetSession(),
}));

/** Build a minimal fetch Response stand-in. */
function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("apiFetch 401 refresh-and-retry", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("refreshes the session and retries once with the new token on 401", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(401, { error: "Unauthorized" }))
      .mockResolvedValueOnce(response(200, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;
    mockGetSession.mockResolvedValue({ accessToken: "fresh-token" });

    const result = await apiFetch("http://api/x", "stale-token");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // First attempt used the stale token, retry used the refreshed one.
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer stale-token",
    });
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      Authorization: "Bearer fresh-token",
    });
  });

  it("does not retry when the refreshed token is unchanged (genuine 403-style 401)", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(response(401, { error: "Forbidden" }));
    global.fetch = fetchMock as unknown as typeof fetch;
    mockGetSession.mockResolvedValue({ accessToken: "same-token" });

    await expect(apiFetch("http://api/x", "same-token")).rejects.toThrow("Forbidden");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry when the session refresh fails (refresh token expired)", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(response(401, { error: "Unauthorized" }));
    global.fetch = fetchMock as unknown as typeof fetch;
    mockGetSession.mockResolvedValue({ error: "RefreshAccessTokenError" });

    await expect(apiFetch("http://api/x", "stale-token")).rejects.toThrow("Unauthorized");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries at most once (a 401 on the retry is surfaced, no infinite loop)", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(401, { error: "Unauthorized" }))
      .mockResolvedValueOnce(response(401, { error: "Still unauthorized" }));
    global.fetch = fetchMock as unknown as typeof fetch;
    mockGetSession.mockResolvedValue({ accessToken: "fresh-token" });

    await expect(apiFetch("http://api/x", "stale-token")).rejects.toThrow("Still unauthorized");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it("does not refresh on a successful first response", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(response(200, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch("http://api/x", "good-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("shares one session refresh across concurrent 401s (no refresh-token-rotation race)", async () => {
    // Regression test: a page that fires several apiFetch calls at once (e.g.
    // Studies loading studies + participants + sessions + comments together)
    // used to have each 401 independently call getSession(). Keycloak refresh
    // tokens are single-use, so only the first of those concurrent refreshes
    // succeeded server-side — the others redeemed an already-consumed refresh
    // token and errored, surfacing a 401 that only a manual reload cleared.
    const fetchMock = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      const auth = (opts.headers as Record<string, string>).Authorization;
      return Promise.resolve(
        auth === "Bearer fresh-token"
          ? response(200, { ok: true })
          : response(401, { error: "Unauthorized" })
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    mockGetSession.mockResolvedValue({ accessToken: "fresh-token" });

    const results = await Promise.all([
      apiFetch("http://api/studies", "stale-token"),
      apiFetch("http://api/participants", "stale-token"),
      apiFetch("http://api/sessions", "stale-token"),
      apiFetch("http://api/comments", "stale-token"),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }, { ok: true }]);
    // One shared refresh, not one per request.
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });
});
