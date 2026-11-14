export interface SandboxGrant {
	url: string;
	token: string;
	expiresAt: number;
}

export type RequestSandboxGrant<G extends SandboxGrant> = (
	workspaceId: string,
	wake: boolean,
) => Promise<G>;

const STALE_BEFORE_MS = 60_000;

export function isGrantFresh(grant: SandboxGrant, now = Date.now()): boolean {
	return grant.expiresAt - now > STALE_BEFORE_MS;
}

export interface SandboxAccess<G extends SandboxGrant> {
	get(workspaceId: string): G | null;
	tokenFor(url: string): string | null;
	ensure(workspaceId: string): Promise<G>;
	address(workspaceId: string): Promise<G>;
	wake(workspaceId: string): Promise<G>;
	refresh(workspaceId: string): void;
	clear(workspaceId: string): void;
	prune(keepIds: ReadonlySet<string>): void;
}

export function createSandboxAccess<G extends SandboxGrant>(
	request: RequestSandboxGrant<G>,
	{
		onGrant,
	}: {
		onGrant?: (grant: G) => void | Promise<void>;
	} = {},
): SandboxAccess<G> {
	const grantByWorkspaceId = new Map<string, G>();
	const tokenByUrl = new Map<string, string>();
	const inflight = new Map<string, Promise<G>>();
	const epochByWorkspaceId = new Map<string, number>();
	const wakesByWorkspaceId = new Map<string, number>();

	function mint(workspaceId: string, wake: boolean): Promise<G> {
		const key = `${workspaceId}:${wake}`;
		const pending = inflight.get(key);
		if (pending) return pending;

		const epoch = epochByWorkspaceId.get(workspaceId) ?? 0;
		const wakes = wakesByWorkspaceId.get(workspaceId) ?? 0;
		const minted = request(workspaceId, wake)
			.then(async (grant) => {
				const isCurrent = () =>
					(epochByWorkspaceId.get(workspaceId) ?? 0) === epoch;
				const supersededByWake = () =>
					!wake && (wakesByWorkspaceId.get(workspaceId) ?? 0) !== wakes;
				if (!isCurrent()) return grant;
				if (supersededByWake()) {
					return grantByWorkspaceId.get(workspaceId) ?? grant;
				}
				if (wake) {
					wakesByWorkspaceId.set(
						workspaceId,
						(wakesByWorkspaceId.get(workspaceId) ?? 0) + 1,
					);
				}
				await onGrant?.(grant);
				if (!isCurrent()) return grant;
				if (supersededByWake()) {
					return grantByWorkspaceId.get(workspaceId) ?? grant;
				}
				const previous = grantByWorkspaceId.get(workspaceId);
				if (previous && previous.url !== grant.url) {
					tokenByUrl.delete(previous.url);
				}
				grantByWorkspaceId.set(workspaceId, grant);
				tokenByUrl.set(grant.url, grant.token);
				return grant;
			})
			.finally(() => {
				if (inflight.get(key) === minted) inflight.delete(key);
			});
		inflight.set(key, minted);
		return minted;
	}

	function refresh(workspaceId: string): void {
		epochByWorkspaceId.set(
			workspaceId,
			(epochByWorkspaceId.get(workspaceId) ?? 0) + 1,
		);
		inflight.delete(`${workspaceId}:false`);
		inflight.delete(`${workspaceId}:true`);
	}

	function clear(workspaceId: string): void {
		refresh(workspaceId);
		const grant = grantByWorkspaceId.get(workspaceId);
		if (grant) tokenByUrl.delete(grant.url);
		grantByWorkspaceId.delete(workspaceId);
	}

	return {
		get: (workspaceId) => grantByWorkspaceId.get(workspaceId) ?? null,
		tokenFor: (url) => tokenByUrl.get(url) ?? null,
		ensure(workspaceId) {
			const cached = grantByWorkspaceId.get(workspaceId);
			if (cached && isGrantFresh(cached)) {
				return Promise.resolve(cached);
			}
			return mint(workspaceId, true);
		},
		address: (workspaceId) => mint(workspaceId, false),
		wake: (workspaceId) => mint(workspaceId, true),
		refresh,
		clear,
		prune(keepIds) {
			const known = new Set(grantByWorkspaceId.keys());
			for (const key of inflight.keys()) {
				known.add(key.slice(0, key.lastIndexOf(":")));
			}
			for (const workspaceId of known) {
				if (!keepIds.has(workspaceId)) clear(workspaceId);
			}
		},
	};
}
