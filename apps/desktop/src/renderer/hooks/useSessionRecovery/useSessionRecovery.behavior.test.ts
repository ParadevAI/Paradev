import { afterEach, describe, expect, it, mock } from "bun:test";
import { useSessionRecoveryState } from "./useSessionRecovery";

const { act, cleanup, renderHook } = await import("@testing-library/react");

type SessionState = Parameters<typeof useSessionRecoveryState>[0];

function failedSession(status = 0): SessionState {
	return {
		data: null,
		error: Object.assign(new Error("Session lookup failed"), {
			status,
			statusText: "",
			error: {},
		}),
		isPending: false,
		isRefetching: false,
		refetch: mock(async () => {}),
	};
}

afterEach(cleanup);

describe("useSessionRecovery", () => {
	it("keeps a saved session recoverable when reconnecting before the API is reachable", async () => {
		const state = failedSession();
		const { result, rerender } = renderHook(
			({ online }) => useSessionRecoveryState(state, true, online),
			{ initialProps: { online: false } },
		);
		expect(result.current.isRecovering).toBe(false);
		expect(state.refetch).not.toHaveBeenCalled();

		await act(async () => rerender({ online: true }));
		expect(result.current.isRecovering).toBe(true);
		expect(state.refetch).toHaveBeenCalledTimes(1);

		await act(async () => window.dispatchEvent(new Event("focus")));
		expect(state.refetch).toHaveBeenCalledTimes(2);
		expect(result.current.isRecovering).toBe(true);
	});

	it("keeps a saved session recoverable while the server is unavailable", () => {
		const { result } = renderHook(() =>
			useSessionRecoveryState(failedSession(503), true, true),
		);

		expect(result.current.isRecovering).toBe(true);
	});

	it.each([
		401, 403,
	])("allows sign-in after the server rejects the session with %i", (status) => {
		const { result } = renderHook(() =>
			useSessionRecoveryState(failedSession(status), true, true),
		);

		expect(result.current.isRecovering).toBe(false);
	});

	it("allows sign-in when a successful lookup confirms there is no session", () => {
		const state = { ...failedSession(), error: null };
		const { result } = renderHook(() =>
			useSessionRecoveryState(state, true, true),
		);

		expect(result.current.session).toBeNull();
		expect(result.current.isRecovering).toBe(false);
	});

	it("does not restore a session when no saved token exists", () => {
		const state = failedSession();
		const { result } = renderHook(() =>
			useSessionRecoveryState(state, false, true),
		);

		expect(result.current.hasLocalToken).toBe(false);
		expect(result.current.isRecovering).toBe(false);
		expect(state.refetch).not.toHaveBeenCalled();
	});
});
