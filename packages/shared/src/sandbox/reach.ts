import { isGrantFresh, type SandboxAccess, type SandboxGrant } from "./access";

export const SANDBOX_STOPPED_STATUS = 410;

const PROBE_TIMEOUT_MS = 5_000;

export type SandboxHostState = "serving" | "stopped" | "unreachable";

export function isSandboxStopped(response: { status: number }): boolean {
	return response.status === SANDBOX_STOPPED_STATUS;
}

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
