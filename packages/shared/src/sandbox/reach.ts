import { isGrantFresh, type SandboxAccess, type SandboxGrant } from "./access";

/**
 * The provider answers a stopped box with `410` through the gate, on every
 * route. It is the one signal that a wake, not a redial, is what's missing.
 */
export const SANDBOX_STOPPED_STATUS = 410;

const PROBE_TIMEOUT_MS = 5_000;

export type SandboxHostState = "serving" | "stopped" | "unreachable";

export function isSandboxStopped(response: { status: number }): boolean {
	return response.status === SANDBOX_STOPPED_STATUS;
}

/**
 * Asks host-service in the box whether it is serving. A WebSocket hides its
 * upgrade's HTTP status, so a socket that will not open probes with this to
 * learn whether the box is stopped.
 */
export async function probeSandboxHost(
	url: string,
	token: string,
	timeoutMs = PROBE_TIMEOUT_MS,
): Promise<SandboxHostState> {
	try {
		const response = await fetch(
			`${url.replace(/\/$/, "")}/trpc/health.check`,
			{
				headers: { authorization: `Bearer ${token}` },
				cache: "no-store",
				signal: AbortSignal.timeout(timeoutMs),
			},
		);
		if (isSandboxStopped(response)) return "stopped";
		return response.ok ? "serving" : "unreachable";
	} catch {
		return "unreachable";
	}
}

/**
 * Calls a box at its known address, and wakes it only when nothing answered
 * there. Tries the cached grant, then a fresh address, then a wake. A call
 * the box answered, error or not, is never repeated: `isUnanswered` says
 * which failures mean the box did not answer.
 */
export async function callWithWake<G extends SandboxGrant, T>({
	access,
	workspaceId,
	call,
	cached = access.get(workspaceId),
	isUnanswered,
}: {
	access: SandboxAccess<G>;
	workspaceId: string;
	call: (grant: G) => Promise<T>;
	cached?: G | null;
	isUnanswered: (error: unknown) => boolean;
}): Promise<T> {
	if (cached && isGrantFresh(cached)) {
		try {
			return await call(cached);
		} catch (error) {
			if (!isUnanswered(error)) throw error;
		}
	}
	const addressed = await access.address(workspaceId);
	try {
		return await call(addressed);
	} catch (error) {
		if (!isUnanswered(error)) throw error;
	}
	return call(await access.wake(workspaceId));
}
