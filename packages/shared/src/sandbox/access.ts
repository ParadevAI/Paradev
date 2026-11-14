/**
 * A cloud workspace's box is reached through the sandbox gate with a ticket
 * the API mints by `cloudWorkspace.access`. Every client holds its grants
 * here, so all of them address, wake, and retire a box the same way.
 */
export interface SandboxGrant {
	url: string;
	token: string;
	expiresAt: number;
}

/**
 * `wake: false` addresses the box without touching it; `wake: true` resumes
 * a stopped box (or extends a running one) and can move its address.
 */
export type RequestSandboxGrant<G extends SandboxGrant> = (
	workspaceId: string,
	wake: boolean,
) => Promise<G>;

/**
 * Re-mint this close to expiry rather than at it: a ticket that dies mid-dial
 * costs a reconnect, and a suspended client may have missed the refresh.
 */
const STALE_BEFORE_MS = 60_000;

export function isGrantFresh(grant: SandboxGrant, now = Date.now()): boolean {
	return grant.expiresAt - now > STALE_BEFORE_MS;
}

export interface SandboxAccess<G extends SandboxGrant> {
	get(workspaceId: string): G | null;
	/** The ticket for a gate URL, for clients that attach it by URL. */
	tokenFor(url: string): string | null;
	/** The current grant, or a wake when there is none or it is about to expire. */
	ensure(workspaceId: string): Promise<G>;
	/**
	 * A grant at the box's last known address, without waking it. A running box
	 * answers there straight away; a stopped one answers `410` until a wake lands.
	 */
	address(workspaceId: string): Promise<G>;
	/** Resumes a stopped box and extends a running one. Concurrent callers share one wake. */
	wake(workspaceId: string): Promise<G>;
	/**
	 * After a restart, which can resume the box on a new domain: requests
	 * already in flight are dropped, so the next address or wake asks again.
	 */
	refresh(workspaceId: string): void;
	/** Forget a workspace that is gone; its URL stops resolving a ticket. */
	clear(workspaceId: string): void;
	/** Drop every grant for a workspace the caller no longer lists. */
	prune(keepIds: ReadonlySet<string>): void;
}

export function createSandboxAccess<G extends SandboxGrant>(
	request: RequestSandboxGrant<G>,
	{
		onGrant,
	}: {
		/** Registers a grant's ticket; runs only for a grant that is kept, before callers get it. */
		onGrant?: (grant: G) => void | Promise<void>;
	} = {},
): SandboxAccess<G> {
	const grantByWorkspaceId = new Map<string, G>();
	const tokenByUrl = new Map<string, string>();
	const inflight = new Map<string, Promise<G>>();
	// Bumped when a workspace is retired, so a mint already in flight cannot
	// land afterwards and resurrect credentials for it.
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
				if ((epochByWorkspaceId.get(workspaceId) ?? 0) !== epoch) return grant;
				// A resumed box can answer on a new domain; an address read
				// before that wake landed points at the old one.
				if (!wake && (wakesByWorkspaceId.get(workspaceId) ?? 0) !== wakes) {
					return grantByWorkspaceId.get(workspaceId) ?? grant;
				}
				if (wake) wakesByWorkspaceId.set(workspaceId, wakes + 1);
				const previous = grantByWorkspaceId.get(workspaceId);
				if (previous && previous.url !== grant.url) {
					tokenByUrl.delete(previous.url);
				}
				grantByWorkspaceId.set(workspaceId, grant);
				tokenByUrl.set(grant.url, grant.token);
				await onGrant?.(grant);
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
			for (const workspaceId of grantByWorkspaceId.keys()) {
				if (!keepIds.has(workspaceId)) clear(workspaceId);
			}
		},
	};
}
