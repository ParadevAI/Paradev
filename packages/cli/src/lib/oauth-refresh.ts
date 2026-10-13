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
		lockStaleMs: 30_000,
		lockTimeoutMs: 10_000,
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
 * Exclusive-create lock file. A stale lock is stolen with a rename so only
 * one waiter can win the steal; losers see ENOENT and retry the create. On
 * timeout the caller proceeds without the lock: blocking auth forever is
 * worse than the race this protects against, and the recheck-on-failure in
 * refreshStoredAuth still covers the degraded path.
 */
async function acquireLock(deps: RefreshDeps): Promise<() => void> {
	const deadline = deps.now() + deps.lockTimeoutMs;
	for (;;) {
		try {
			const fd = fs.openSync(deps.lockPath, "wx");
			fs.writeSync(fd, String(process.pid));
			fs.closeSync(fd);
			return () => {
				try {
					fs.unlinkSync(deps.lockPath);
				} catch {}
			};
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
				// The home dir is missing or the filesystem refuses locks.
				// Proceed unlocked rather than make auth impossible.
				return () => {};
			}
		}
		try {
			const age = deps.now() - fs.statSync(deps.lockPath).mtimeMs;
			if (age > deps.lockStaleMs) {
				const corpse = `${deps.lockPath}.${randomUUID()}.stale`;
				fs.renameSync(deps.lockPath, corpse);
				try {
					fs.unlinkSync(corpse);
				} catch {}
				continue;
			}
		} catch {
			// The holder released between our open and stat; retry at once.
			continue;
		}
		if (deps.now() >= deadline) return () => {};
		await deps.sleep(deps.pollMs);
	}
}
