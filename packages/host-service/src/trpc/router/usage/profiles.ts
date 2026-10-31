/**
 * Auto-discovery of extra AI CLI logins — the homes users point
 * CLAUDE_CONFIG_DIR / CODEX_HOME at for multi-account setups (runway's
 * discovery model, ported from its ClaudeConfigDirDiscovery):
 *
 * - Candidates are dot-dirs at `~` plus dirs under `~/.config` — bounded,
 *   never temp dirs or project trees.
 * - A Claude candidate counts when its own `.claude.json` names an OAuth
 *   account ("identity-extraction-is-validation" — keeps forks and sandbox
 *   homes out), or when Superset's API-billing login command finished and
 *   left its marker file. Custom config dirs keep state INSIDE the dir; only
 *   the default `~/.claude` keeps it next door at `~/.claude.json`.
 * - API-billed profiles (Anthropic Console, `codex login --with-api-key`)
 *   are recognised by the marker alone. Their credential files are never
 *   opened: there is no quota to fetch, and the key should not pass through
 *   Superset.
 * - Credentials come from the dir's `.credentials.json` or its per-profile
 *   Keychain item: Claude Code hashes the literal CLAUDE_CONFIG_DIR string,
 *   so the service is `Claude Code-credentials-<sha256(literal)[0..8)>` and
 *   several path spellings must be probed (`~/x` vs absolute differ). Items
 *   are keyed on the login user's account too — see readKeychainSecrets.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { homedir, platform, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	PROFILE_LEDGER_NAME,
	resolveAmbientCodexHome,
} from "@superset/agent-setup";

const execFileAsync = promisify(execFile);

const SCAN_TIME_BUDGET_MS = 1_500;
const MAX_STATE_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Written inside a profile dir by the add-account command once the
 * provider's API-billing login succeeds (the renderer's addAccountCommand
 * appends it). It holds the agent id, so a marked `~/.codex-*` home is never
 * mistaken for a Claude profile by the broader Claude dot-dir scan. Its
 * mtime is the login fingerprint, since a re-login rewrites it.
 */
export const API_BILLING_MARKER = ".superset-api-billing";
/**
 * Marks a profile dir that Paradev created, holding the agent id. A Codex
 * home is listed as signed out only when it carries one: that card offers
 * Remove, which deletes the whole dir.
 */
export const PROFILE_CREATED_MARKER = ".superset-created";
const MAX_MARKER_BYTES = 64;

export type ProfileCredentialKind = "subscription" | "api_key";

export const SIGNED_OUT_PROFILE_DETAIL =
	"Signed out — use Switch sign-in to reconnect, or Remove to delete this profile.";

export interface ClaudeProfile {
	/** Absolute config dir path (the CLAUDE_CONFIG_DIR value's expansion). */
	configDir: string;
	/** `~`-relative label for display. */
	sourceLabel: string;
	email: string | null;
	credentialKind: ProfileCredentialKind;
	/** API profiles only: changes when the login command completes again. */
	loginFingerprint: string | null;
	credentialsPath: string;
	/** Keychain service names to probe when the file has no token. */
	keychainServices: string[];
}

export interface CodexHome {
	home: string;
	sourceLabel: string;
	credentialKind: ProfileCredentialKind;
	/** API profiles only; derived from the marker, never from auth.json. */
	loginFingerprint: string | null;
	/** A home Paradev created and set up that holds no login. */
	signedOut: boolean;
}

function tildeLabel(path: string): string {
	return path.replace(homedir(), "~");
}

function hashSuffix(literal: string): string {
	return createHash("sha256")
		.update(literal.normalize("NFC"), "utf8")
		.digest("hex")
		.slice(0, 8);
}

/** Every plausible spelling Claude Code might have hashed for this dir. */
export function keychainServicesForConfigDir(configDir: string): string[] {
	const home = homedir();
	const spellings = new Set<string>([configDir]);
	if (configDir.startsWith(home)) {
		spellings.add(`~${configDir.slice(home.length)}`);
		spellings.add(`$HOME${configDir.slice(home.length)}`);
	}
	if (configDir.endsWith("/")) spellings.add(configDir.slice(0, -1));
	else spellings.add(`${configDir}/`);
	return [...spellings].map(
		(spelling) => `Claude Code-credentials-${hashSuffix(spelling)}`,
	);
}

async function listSubdirectories(dir: string): Promise<string[]> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => join(dir, entry.name));
	} catch {
		return [];
	}
}

async function candidateDirectories(): Promise<string[]> {
	const home = homedir();
	const dotDirs = (await listSubdirectories(home)).filter((path) =>
		path.slice(home.length + 1).startsWith("."),
	);
	const configDirs = await listSubdirectories(join(home, ".config"));
	return [...dotDirs, ...configDirs].sort();
}

interface ClaudeStateFile {
	oauthAccount?: { emailAddress?: string; accountUuid?: string };
}

async function readClaudeIdentity(
	configDir: string,
): Promise<{ email: string | null } | null> {
	const statePath = join(configDir, ".claude.json");
	try {
		const info = await stat(statePath);
		if (!info.isFile() || info.size > MAX_STATE_FILE_BYTES) return null;
		const parsed: ClaudeStateFile = JSON.parse(
			await readFile(statePath, "utf-8"),
		);
		const account = parsed.oauthAccount;
		if (!account?.accountUuid && !account?.emailAddress) return null;
		return { email: account.emailAddress ?? null };
	} catch {
		return null;
	}
}

/** A marker file's stats, or null unless it exists and names `agent`. */
async function readAgentMarker(
	profileDir: string,
	marker: string,
	agent: "claude" | "codex",
): Promise<Stats | null> {
	const markerPath = join(profileDir, marker);
	try {
		const info = await stat(markerPath);
		if (!info.isFile() || info.size > MAX_MARKER_BYTES) return null;
		const content = (await readFile(markerPath, "utf-8")).trim();
		return content === agent ? info : null;
	} catch {
		return null;
	}
}

/** The marker's mtime, or null when the dir is not API-billed for `agent`. */
export async function readApiBillingFingerprint(
	profileDir: string,
	agent: "claude" | "codex",
): Promise<string | null> {
	const marker = await readAgentMarker(profileDir, API_BILLING_MARKER, agent);
	return marker ? `${marker.mtimeMs}` : null;
}

export async function hasProfileCreatedMarker(
	profileDir: string,
	agent: "claude" | "codex",
): Promise<boolean> {
	return (
		(await readAgentMarker(profileDir, PROFILE_CREATED_MARKER, agent)) !== null
	);
}

/**
 * Extra Claude profile dirs beyond the defaults. Default homes are excluded —
 * callers already cover `~/.claude` and `~/.config/claude`. `candidates`
 * overrides the home-dir scan for tests.
 */
export async function discoverClaudeProfiles(
	candidates?: string[],
): Promise<ClaudeProfile[]> {
	const home = homedir();
	const excluded = new Set([
		join(home, ".claude"),
		join(home, ".config", "claude"),
	]);
	const started = Date.now();
	const profiles: ClaudeProfile[] = [];

	for (const candidate of candidates ?? (await candidateDirectories())) {
		if (Date.now() - started > SCAN_TIME_BUDGET_MS) break;
		if (excluded.has(candidate)) continue;
		const [identity, apiFingerprint] = await Promise.all([
			readClaudeIdentity(candidate),
			readApiBillingFingerprint(candidate, "claude"),
		]);
		if (!identity && !apiFingerprint) continue;
		profiles.push({
			configDir: candidate,
			sourceLabel: tildeLabel(candidate),
			email: identity?.email ?? null,
			credentialKind: apiFingerprint ? "api_key" : "subscription",
			loginFingerprint: apiFingerprint,
			credentialsPath: join(candidate, ".credentials.json"),
			keychainServices: keychainServicesForConfigDir(candidate),
		});
	}
	return profiles;
}

const KEYCHAIN_ACCOUNT_PATTERN = /^[a-zA-Z0-9._-]+$/;
const KEYCHAIN_ACCOUNT_FALLBACK = "claude-code-user";
/** What Bun's os.userInfo() reports as the user name when USER is unset. */
const BUN_USERINFO_FALLBACK = "unknown";

/**
 * The `-a` accounts Claude Code may file its Keychain items under, likeliest
 * first. The CLI uses `$USER`, else `os.userInfo().username`, and swaps a
 * name outside its pattern for a fixed fallback. Its native build runs on
 * Bun, whose userInfo() reports "unknown" instead of the passwd name, so a
 * CLI launched without USER (hand-built harness envs do this) keeps a
 * separate "unknown" identity, while the npm build on Node uses the real
 * name — without USER, both are probed.
 */
export function claudeKeychainAccounts(
	env: NodeJS.ProcessEnv = process.env,
	passwdName: () => string = () => userInfo().username,
): string[] {
	const validated = (name: string) =>
		KEYCHAIN_ACCOUNT_PATTERN.test(name) ? name : KEYCHAIN_ACCOUNT_FALLBACK;
	if (env.USER) return [validated(env.USER)];
	let fromPasswd: string;
	try {
		fromPasswd = validated(passwdName());
	} catch {
		fromPasswd = KEYCHAIN_ACCOUNT_FALLBACK;
	}
	return [...new Set([fromPasswd, BUN_USERINFO_FALLBACK])];
}

/**
 * Every distinct secret filed under a Keychain service; empty off macOS.
 * `security` returns one item per lookup, and a service can hold several:
 * Claude Code keys each on an account name (see claudeKeychainAccounts),
 * and a sibling identity — a CLI run without USER left an "unknown" item
 * holding only MCP OAuth tokens — is what an unscoped lookup returns first,
 * which made the real login vanish from the quota panel. The CLI's own
 * accounts are probed first; the unscoped lookup then covers items an older
 * client filed under a different name.
 */
export async function readKeychainSecrets(service: string): Promise<string[]> {
	if (platform() !== "darwin") return [];
	const secrets: string[] = [];
	const scopes = [
		...claudeKeychainAccounts().map((account) => ["-a", account]),
		[],
	];
	for (const scope of scopes) {
		try {
			const { stdout } = await execFileAsync(
				"security",
				["find-generic-password", ...scope, "-s", service, "-w"],
				{ timeout: 5_000 },
			);
			const secret = stdout.trim();
			if (secret && !secrets.includes(secret)) secrets.push(secret);
		} catch {
			// No item under this scope.
		}
	}
	return secrets;
}

interface CodexAuthShape {
	tokens?: { access_token?: string };
}

/**
 * How a Codex home is billed, or null when it holds no usable login. The
 * marker is checked first so an API-billed home's auth.json (which holds
 * the raw key) is never opened.
 */
export async function readCodexProfileKind(
	codexHome: string,
): Promise<Pick<CodexHome, "credentialKind" | "loginFingerprint"> | null> {
	const apiFingerprint = await readApiBillingFingerprint(codexHome, "codex");
	if (apiFingerprint) {
		return { credentialKind: "api_key", loginFingerprint: apiFingerprint };
	}
	try {
		const parsed: CodexAuthShape = JSON.parse(
			await readFile(join(codexHome, "auth.json"), "utf-8"),
		);
		return parsed.tokens?.access_token
			? { credentialKind: "subscription", loginFingerprint: null }
			: null;
	} catch {
		// No parsable auth.json — not a Codex home.
		return null;
	}
}

async function isFile(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

/** auth.json fields that describe a login without being a credential. */
const CODEX_AUTH_METADATA = new Set(["auth_mode", "last_refresh"]);

function isBlank(value: unknown): boolean {
	return value === null || value === undefined || value === "";
}

/**
 * Whether a parsed auth.json holds anything Codex could sign in with. Codex
 * keeps a login in `tokens` (a refresh token alone renews the access token),
 * `OPENAI_API_KEY`, `personal_access_token`, `agent_identity`,
 * `bedrock_api_key` or `bedrock_access_keys`. Any other field that is set
 * counts as a login too, so a kind added later is never read as signed out.
 */
function holdsCodexLogin(auth: unknown): boolean {
	if (typeof auth !== "object" || auth === null || Array.isArray(auth)) {
		return true;
	}
	return Object.entries(auth).some(([field, value]) => {
		if (CODEX_AUTH_METADATA.has(field) || isBlank(value)) return false;
		if (
			field !== "tokens" ||
			typeof value !== "object" ||
			Array.isArray(value)
		) {
			return true;
		}
		const tokens = value as { access_token?: unknown; refresh_token?: unknown };
		return !isBlank(tokens.access_token) || !isBlank(tokens.refresh_token);
	});
}

/** `cli_auth_credentials_store = …` in a Codex config.toml. */
const CREDENTIALS_STORE_SETTING =
	/^\s*["']?cli_auth_credentials_store["']?\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s#]*))/gm;

/**
 * True unless the home's config.toml leaves the login in auth.json. With
 * `cli_auth_credentials_store` set to `keyring`, or to `auto` where a keyring
 * exists, Codex saves the login in the OS keyring and deletes auth.json.
 * Provisioning copies config.toml from the default home, so that setting can
 * reach every profile. A config.toml that cannot be read is not trusted.
 */
async function mayKeepLoginOutsideAuthFile(
	codexHome: string,
): Promise<boolean> {
	let config: string;
	try {
		config = await readFile(join(codexHome, "config.toml"), "utf-8");
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ENOENT";
	}
	for (const match of config.matchAll(CREDENTIALS_STORE_SETTING)) {
		if ((match[1] ?? match[2] ?? match[3]) !== "file") return true;
	}
	return false;
}

/**
 * True when Paradev created the home and set it up, and it holds no login.
 *
 * - Created: it carries the creation marker. Provisioning (Make default,
 *   host boot) also writes the profile ledger into homes Paradev did not
 *   create, so the ledger alone does not count.
 * - Set up: it holds the ledger, which provisioning writes once a sign-in
 *   there has completed. A home whose first sign-in is still running, or
 *   was cancelled, stays hidden.
 * - No login: auth.json is missing, or is a file that parses to no
 *   credential, and config.toml keeps logins in that file. An auth.json that
 *   is a symlink, is not a file or does not parse (it can be mid-write) is
 *   left alone.
 */
async function isSignedOutCodexHome(codexHome: string): Promise<boolean> {
	if (!(await hasProfileCreatedMarker(codexHome, "codex"))) return false;
	if (!(await isFile(join(codexHome, PROFILE_LEDGER_NAME)))) return false;
	if (await mayKeepLoginOutsideAuthFile(codexHome)) return false;
	const authPath = join(codexHome, "auth.json");
	try {
		if (!(await lstat(authPath)).isFile()) return false;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "ENOENT";
	}
	try {
		return !holdsCodexLogin(JSON.parse(await readFile(authPath, "utf-8")));
	} catch {
		return false;
	}
}

/**
 * Codex homes: the ambient home (`~/.codex`, or a `CODEX_HOME` the user set
 * themselves — see resolveAmbientCodexHome for why Superset's own injected
 * value is ignored) plus any `~/.codex*` dot-dir carrying an `auth.json` with
 * a token or the API-billing marker. The common multi-account convention is
 * one CODEX_HOME dir per account. A dot-dir Paradev created and set up stays
 * listed, flagged `signedOut`, once it holds no login, so it can be signed in
 * again or removed.
 *
 * The first entry is the system default, and `fetchCodexAccounts` gives it
 * `selection: null`. It is listed even without an `auth.json` so the
 * add-account poller has a baseline to compare a fresh `codex login` against.
 * `homeDir` overrides the home dir for tests.
 */
export async function discoverCodexHomes(
	homeDir?: string,
): Promise<CodexHome[]> {
	const home = homeDir ?? homedir();
	// An injected home must not resolve to the machine's own CODEX_HOME.
	const defaultHome =
		homeDir === undefined
			? resolveAmbientCodexHome(home)
			: join(home, ".codex");
	const defaultKind = (await readCodexProfileKind(defaultHome)) ?? {
		credentialKind: "subscription" as const,
		loginFingerprint: null,
	};
	const homes = new Map<string, CodexHome>([
		[
			defaultHome,
			{
				home: defaultHome,
				sourceLabel: tildeLabel(defaultHome),
				...defaultKind,
				signedOut: false,
			},
		],
	]);

	const candidates = (await listSubdirectories(home)).filter((path) =>
		path.slice(home.length + 1).startsWith(".codex"),
	);
	for (const candidate of candidates) {
		if (homes.has(candidate)) continue;
		const kind = await readCodexProfileKind(candidate);
		if (kind) {
			homes.set(candidate, {
				home: candidate,
				sourceLabel: tildeLabel(candidate),
				...kind,
				signedOut: false,
			});
		} else if (await isSignedOutCodexHome(candidate)) {
			homes.set(candidate, {
				home: candidate,
				sourceLabel: tildeLabel(candidate),
				credentialKind: "subscription",
				loginFingerprint: null,
				signedOut: true,
			});
		}
	}
	return [...homes.values()];
}
