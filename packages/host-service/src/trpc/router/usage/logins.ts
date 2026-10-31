import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { mapWithConcurrency } from "../git/utils/git-helpers";
import { readClaudeLoginFingerprint, readDefaultLoginEmail } from "./claude";
import {
	type ClaudeProfile,
	discoverClaudeProfiles,
	discoverCodexHomes,
	readCodexProfileKind,
} from "./profiles";

// Each read runs `security` up to a dozen times in a row (readKeychainSecrets).
export const FINGERPRINT_READ_CONCURRENCY = 4;

export function readClaudeFingerprints(
	profiles: ClaudeProfile[],
	readFingerprint: (
		configDir: string,
	) => Promise<string | null> = readClaudeLoginFingerprint,
) {
	return mapWithConcurrency(
		profiles,
		FINGERPRINT_READ_CONCURRENCY,
		async (profile) => ({
			configDir: profile.configDir,
			email: profile.email,
			credentialKind: profile.credentialKind,
			fingerprint:
				profile.credentialKind === "api_key"
					? profile.loginFingerprint
					: await readFingerprint(profile.configDir),
		}),
	);
}

async function scanLogins() {
	const [profiles, codexHomes, claudeDefaultEmail, claudeDefaultFingerprint] =
		await Promise.all([
			discoverClaudeProfiles(),
			discoverCodexHomes(),
			readDefaultLoginEmail(),
			readClaudeLoginFingerprint(null),
		]);
	// auth.json fingerprints let the UI notice a re-login on any Codex home
	// (its email is only knowable via the network). The first home is the
	// system default.
	const codex = await Promise.all(
		codexHomes.map(async ({ home, credentialKind, loginFingerprint }) => {
			// An API-billed home's auth.json holds the raw key and is never
			// opened; its marker mtime is the fingerprint instead.
			let fingerprint = loginFingerprint;
			if (
				credentialKind === "subscription" &&
				(await readCodexProfileKind(home))?.credentialKind === "subscription"
			) {
				try {
					fingerprint = createHash("sha256")
						.update(await readFile(join(home, "auth.json")))
						.digest("hex");
				} catch {
					// No readable auth.json — fingerprint stays null.
				}
			}
			return { home, fingerprint, credentialKind };
		}),
	);
	return {
		homeDir: homedir(),
		claudeDefaultFingerprint,
		claude: await readClaudeFingerprints(profiles),
		codex,
		claudeDefaultEmail,
	};
}

/**
 * Calls made while `run` is pending get its promise; the first call after it
 * settles starts a new run. Not a cache: a timed-out query does not stop its
 * run, so this keeps the next poll from starting a second one beside it.
 */
export function shareInFlight<T>(run: () => Promise<T>): () => Promise<T> {
	let pending: Promise<T> | null = null;
	return () => {
		pending ??= run().finally(() => {
			pending = null;
		});
		return pending;
	};
}

export const readLogins = shareInFlight(scanLogins);
