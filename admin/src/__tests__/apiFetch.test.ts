/**
 * Tests for the apiFetch helper pattern used inline across admin pages
 * (questionnaires/page.tsx, studies/page.tsx).
 *
 * The function is not exported from a shared module — it is copy-pasted into
 * each page file. We test the canonical implementation here to document and
 * guard its contract.
 */

// Re-implement the function exactly as it appears in the source files
async function apiFetch(url: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json();
}

describe("apiFetch helper", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    const payload = { id: "1", name: "test" };
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(payload),
    } as unknown as Response);

    const result = await apiFetch("http://api/test", "mytoken");
    expect(result).toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://api/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mytoken",
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("throws with error message from response body on non-ok response", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: jest.fn().mockResolvedValueOnce({ error: "Forbidden by server" }),
    } as unknown as Response);

    await expect(apiFetch("http://api/test", "tok")).rejects.toThrow("Forbidden by server");
  });

  it("throws HTTP status message when body has no error field", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValueOnce({}),
    } as unknown as Response);

    await expect(apiFetch("http://api/test", "tok")).rejects.toThrow("HTTP 500");
  });

  it("attaches status code to thrown error", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: jest.fn().mockResolvedValueOnce({ error: "Conflict" }),
    } as unknown as Response);

    await expect(apiFetch("http://api/test", "tok")).rejects.toMatchObject({ status: 409 });
  });

  it("throws HTTP status message when json() rejects", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: jest.fn().mockRejectedValueOnce(new SyntaxError("bad json")),
    } as unknown as Response);

    await expect(apiFetch("http://api/test", "tok")).rejects.toThrow("HTTP 502");
  });
});
