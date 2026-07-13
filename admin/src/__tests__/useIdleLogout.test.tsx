/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { useSession } from "next-auth/react";
import { useIdleLogout, IDLE_LOGOUT_MS } from "../lib/useIdleLogout";
import { signOutOfKeycloak } from "../lib/keycloakSignOut";

jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
}));

jest.mock("../lib/keycloakSignOut", () => ({
  signOutOfKeycloak: jest.fn(),
}));

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>;
const mockedSignOut = signOutOfKeycloak as jest.Mock;

describe("useIdleLogout", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedSignOut.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing while unauthenticated, even past the idle window", () => {
    mockedUseSession.mockReturnValue({
      status: "unauthenticated",
    } as ReturnType<typeof useSession>);

    renderHook(() => useIdleLogout());
    act(() => {
      jest.advanceTimersByTime(IDLE_LOGOUT_MS + 1000);
    });

    expect(mockedSignOut).not.toHaveBeenCalled();
  });

  it("signs out after the idle window with no activity", () => {
    mockedUseSession.mockReturnValue({
      status: "authenticated",
    } as ReturnType<typeof useSession>);

    renderHook(() => useIdleLogout());
    act(() => {
      jest.advanceTimersByTime(IDLE_LOGOUT_MS);
    });

    expect(mockedSignOut).toHaveBeenCalledTimes(1);
  });

  it("activity resets the timer so it does not sign out early", () => {
    mockedUseSession.mockReturnValue({
      status: "authenticated",
    } as ReturnType<typeof useSession>);

    renderHook(() => useIdleLogout());

    act(() => {
      jest.advanceTimersByTime(IDLE_LOGOUT_MS - 1000);
    });
    expect(mockedSignOut).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("mousedown"));
      jest.advanceTimersByTime(IDLE_LOGOUT_MS - 1000);
    });
    // Total elapsed since start (~2x window minus 2s) but activity reset the
    // clock partway, so the full idle window never elapsed uninterrupted.
    expect(mockedSignOut).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockedSignOut).toHaveBeenCalledTimes(1);
  });

  it("stops the timer on unmount", () => {
    mockedUseSession.mockReturnValue({
      status: "authenticated",
    } as ReturnType<typeof useSession>);

    const { unmount } = renderHook(() => useIdleLogout());
    unmount();
    act(() => {
      jest.advanceTimersByTime(IDLE_LOGOUT_MS + 1000);
    });

    expect(mockedSignOut).not.toHaveBeenCalled();
  });
});
