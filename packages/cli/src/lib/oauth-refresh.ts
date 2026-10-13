import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { join } from "node:path";
import { refreshAccessToken } from "./auth";
import {
	AUTH_REFRESH_LEEWAY_MS,
	readConfig,
	type SupersetConfig,
	writeConfig,
} from "./config";
import { getSupersetHomeDir } from "./settings/paths";

/**
 * The token endpoint rotates the refresh token on every call: the old one is
 * revoked, and sending a revoked one again is treated as theft, revoking
 * every token the user holds for this client (GH #8426). Several CLI
 * processes run at once as a matter of course here, so the refresh must
 * behave as if the whole machine were one client: take a lock, re-read the
 * config in case another process already renewed, and only then spend the
 * stored refresh token.
 */
export interface RefreshDeps {
	refresh: (refreshToken: string) => Promise<{
		accessToken: string;
		refreshToken?: string;
		expiresAt: number;
	}>;
	readConfig: () => SupersetConfig;
	writeConfig: (config: SupersetConfig) => void;
	lockPath: string;
	/** A lock older than this belongs to a dead process and may be taken over. */
	lockStaleMs: number;
	/** How long to wait for another process before proceeding without the lock. */
	lockTimeoutMs: number;
	pollMs: number;
	now: () => number;
	sleep: (ms: number) => Promise<void>;
}

export function defaultRefreshDeps(): RefreshDeps {
	return {
		refresh: refreshAccessToken,
		readConfig,
		writeConfig,
		lockPath: join(getSupersetHomeDir(), "auth-refresh.lock"),
		// Three times the bounded refresh call (REFRESH_TIMEOUT_MS), so a
		// live holder can never be mistaken for a dead one; the wait budget
		// exceeds the stale threshold so a waiter outlives one takeover.
		lockStaleMs: 30_000,
		lockTimeoutMs: 45_000,
		pollMs: 25,
		now: () => Date.now(),
		sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	};
}

export function isAuthFresh(
	auth: NonNullable<SupersetConfig["auth"]>,
	now: number,
): boolean {
	return auth.expiresAt - AUTH_REFRESH_LEEWAY_MS > now;
}

/**
 * Renews the stored OAuth tokens, coordinating with every other CLI process
 * on this machine. Returns the config holding a usable access token. Throws
 * when the session is genuinely gone and the user must log in again.
 */
export async function refreshStoredAuth(
	deps: RefreshDeps = defaultRefreshDeps(),
): Promise<SupersetConfig> {
	const release = await acquireLock(deps);
	try {
		const latest = deps.readConfig();
		const auth = latest.auth;
		// Whoever held the lock before us may have done the work already.
		if (auth && isAuthFresh(auth, deps.now())) return latest;
		if (!auth?.refreshToken) throw new Error("session expired");
		let refreshed: Awaited<ReturnType<RefreshDeps["refresh"]>>;
		try {
			refreshed = await deps.refresh(auth.refreshToken);
		} catch (error) {
			// The refresh token may have just been spent by a writer the lock
			// could not see (a lock takeover, or a non-CLI writer). A fresh
			// token on disk means the race was lost benignly; use the
			// winner's token instead of failing the command.
			const rechecked = deps.readConfig();
			if (rechecked.auth && isAuthFresh(rechecked.auth, deps.now())) {
				return rechecked;
			}
			throw error;
		}
		const next: SupersetConfig = {
			...latest,
			auth: {
				accessToken: refreshed.accessToken,
				refreshToken: refreshed.refreshToken,
				expiresAt: refreshed.expiresAt,
			},
		};
		deps.writeConfig(next);
		return next;
	} finally {
		release();
	}
}

/**
 * Exclusive-create lock file holding an ownership token. The token makes
 * release and takeover honest: release removes the lock only while it still
 * holds this acquisition's token, and a stale takeover is confirmed by
 * re-reading the renamed file; a lock that changed hands in between is
 * given back. Staleness is sound because the refresh call itself is bounded
 * (REFRESH_TIMEOUT_MS in auth.ts), so a live holder can never look dead.
 * On timeout the caller proceeds without the lock: by then the holder is
 * past every bound and blocking auth forever is worse, and the re-read
 * paths in refreshStoredAuth still cover the degraded case.
 */
async function acquireLock(deps: RefreshDeps): Promise<() => void> {
	const token = `${process.pid} ${randomUUID()}`;
	const deadline = deps.now() + deps.lockTimeoutMs;
	for (;;) {
		try {
			const fd = fs.openSync(deps.lockPath, "wx");
			fs.writeSync(fd, token);
			fs.closeSync(fd);
			return () => {
				try {
					if (fs.readFileSync(deps.lockPath, "utf-8") === token) {
						fs.unlinkSync(deps.lockPath);
					}
				} catch {}
			};
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
				// The home dir is missing or the filesystem refuses locks.
				// Proceed unlocked rather than make auth impossible.
				return () => {};
			}
		}
		// Checked before any takeover work so no error path below can spin
		// without ever reaching the deadline.
		if (deps.now() >= deadline) return () => {};
		try {
			const observed = fs.readFileSync(deps.lockPath, "utf-8");
			const age = deps.now() - fs.statSync(deps.lockPath).mtimeMs;
			if (age > deps.lockStaleMs) {
				const corpse = `${deps.lockPath}.${randomUUID()}.stale`;
				fs.renameSync(deps.lockPath, corpse);
				if (fs.readFileSync(corpse, "utf-8") === observed) {
					fs.unlinkSync(corpse);
					continue;
				}
				// The lock changed hands between the read and the rename:
				// that is a live holder, not a corpse. Put it back.
				try {
					fs.renameSync(corpse, deps.lockPath);
				} catch {
					try {
						fs.unlinkSync(corpse);
					} catch {}
				}
			}
		} catch {
			// Holder released between open and stat, or the filesystem
			// refused the takeover; the sleep below keeps either case from
			// spinning hot.
		}
		await deps.sleep(deps.pollMs);
	}
}
