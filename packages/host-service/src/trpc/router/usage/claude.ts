/**
 * Claude subscription quota, read the same way CodexBar/runway/claudebar do:
 * the Claude Code OAuth token already on this machine, sent to the
 * undocumented `api.anthropic.com/api/oauth/usage` endpoint.
 *
 * Hard rule: tokens are read-only. If one is expired we report
 * `token_stale` (refresh token still good — the CLI refreshes on its next
 * run) or `token_expired` instead of refreshing — a second client
 * refreshing the token can trip Anthropic's token-reuse protection and sign
 * the CLI out.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRestartableClaudeCollectionQueue } from "./claude-collection-queue";
import {
	CLAUDE_IDLE_QUOTA_POLL_MS,
	claudeQuotaPolling,
} from "./claude-quota-polling";
import {
	type ClaudeSubscriptionQuota,
	fetchClaudeSubscriptionQuota,
} from "./claude-subscription";
import { createCredentialQuotaCache } from "./credential-quota-cache";
import {
	canDeferClaudeHttpQuota,
	createNativeClaudeQuotaOverlay,
} from "./native-claude-overlay";
import {
	createNativeClaudeScopeResolver,
	nativeClaudeCredentialGeneration,
} from "./native-claude-scope";
import { nativeClaudeUsage } from "./native-claude-usage";
import {
	discoverClaudeProfiles,
	keychainServicesForConfigDir,
	readKeychainSecrets,
} from "./profiles";
import { copyQuotaRetry } from "./quota-backoff";
import type { QuotaSnapshot } from "./quota-cache";
import {
	parseQuotaCredentialJson,
	QuotaCredentialReadError,
	readQuotaCredentialFile,
	type UnavailableQuotaSlot,
	unavailableQuotaAccount,
} from "./quota-credentials";
import { canonicalQuotaProfile, copyQuotaIdentity } from "./quota-identity";
import {
	createQuotaRequestBudget,
	QUOTA_CAPTURE_BUDGET_MS,
} from "./quota-request";
import type { UsageAccount } from "./types";

const CLAUDE_KEYCHAIN_SERVICE = "Claude Code-credentials";

export interface ClaudeOauthCredential {
	accessToken: string;
	expiresAt: number | null;
	refreshTokenExpiresAt: number | null;
	hasRefreshToken?: boolean;
	subscriptionType: string | null;
	accountKey: string;
	sourceLabel: string;
	/** Config dir to inject as CLAUDE_CONFIG_DIR to run on this login; null
	 * for the system-default login. */
	selection: string | null;
	/** Identity from the profile's own state file, when known. */
	email?: string | null;
}

interface ClaudeCredentialFile {
	claudeAiOauth?: {
		accessToken?: string;
		expiresAt?: number;
		refreshToken?: string;
		refreshTokenExpiresAt?: number;
		subscriptionType?: string;
	};
}

function parseCredential(
	raw: string,
	accountKey: string,
	sourceLabel: string,
	selection: string | null,
	strict = false,
): ClaudeOauthCredential | null {
	try {
		const parsed: ClaudeCredentialFile = strict
			? parseQuotaCredentialJson(raw)
			: JSON.parse(raw);
		const oauth = parsed.claudeAiOauth;
		if (
			strict &&
			oauth !== undefined &&
			(typeof oauth !== "object" ||
				oauth === null ||
				typeof oauth.accessToken !== "string" ||
				!oauth.accessToken.trim())
		)
			throw new QuotaCredentialReadError();
		if (!oauth?.accessToken) return null;
		return {
			accessToken: oauth.accessToken,
			expiresAt: typeof oauth.expiresAt === "number" ? oauth.expiresAt : null,
			hasRefreshToken:
				typeof oauth.refreshToken === "string" &&
				oauth.refreshToken.trim().length > 0,
			refreshTokenExpiresAt:
				typeof oauth.refreshToken === "string" &&
				oauth.refreshToken.trim().length > 0 &&
				typeof oauth.refreshTokenExpiresAt === "number"
					? oauth.refreshTokenExpiresAt
					: null,
			subscriptionType:
				typeof oauth.subscriptionType === "string"
					? oauth.subscriptionType
					: null,
			accountKey,
			sourceLabel,
			selection,
		};
	} catch {
		if (strict) throw new QuotaCredentialReadError();
		return null;
	}
}

async function readCredentialFile(
	path: string,
	sourceLabel: string,
	selection: string | null,
	strict = false,
): Promise<ClaudeOauthCredential | null> {
	try {
		const raw = strict
			? await readQuotaCredentialFile(path)
			: await readFile(path, "utf-8");
		if (raw === null) return null;
		return parseCredential(raw, path, sourceLabel, selection, strict);
	} catch {
		if (strict) throw new QuotaCredentialReadError();
		return null;
	}
}

/** The default login's Keychain item: the freshest of the items sharing its
 * service, since a sibling without a Claude login can sit beside it. */
async function readKeychainCredential(
	strict = false,
): Promise<ClaudeOauthCredential | null> {
	const secrets = await readKeychainSecrets(CLAUDE_KEYCHAIN_SERVICE, strict);
	return pickFreshest(
		secrets.map((secret) =>
			parseCredential(
				secret,
				`keychain:${CLAUDE_KEYCHAIN_SERVICE}`,
				"Keychain",
				null,
				strict,
			),
		),
	);
}

export const STALE_TOKEN_DETAIL = "Refreshes when Claude Code next runs.";
export const EXPIRED_TOKEN_DETAIL =
	"Sign-in expired — run /login in Claude Code.";

/**
 * Claude Code access tokens live about eight hours and the CLI renews them
 * silently from the refresh token on its next run, so a lapsed access token
 * alone does not mean the login is gone. Only a lapsed (or absent) refresh
 * token does.
 */
export function classifyLapsedToken(
	credential: Pick<
		ClaudeOauthCredential,
		"expiresAt" | "refreshTokenExpiresAt" | "hasRefreshToken"
	>,
	now = Date.now(),
): "live" | "token_stale" | "token_expired" {
	if (credential.expiresAt === null || credential.expiresAt > now) {
		return "live";
	}
	if (
		credential.refreshTokenExpiresAt === null
			? credential.hasRefreshToken === true
			: credential.refreshTokenExpiresAt > now
	) {
		return "token_stale";
	}
	return "token_expired";
}

const LAPSED_RANK = { live: 2, token_stale: 1, token_expired: 0 } as const;

/** Live beats stale beats expired; among equals the latest expiry wins. */
export function pickFreshest<T extends ClaudeOauthCredential>(
	candidates: Array<T | null>,
	now = Date.now(),
): T | null {
	let best: T | null = null;
	for (const candidate of candidates) {
		if (!candidate) continue;
		if (!best) {
			best = candidate;
			continue;
		}
		const rank = LAPSED_RANK[classifyLapsedToken(candidate, now)];
		const bestRank = LAPSED_RANK[classifyLapsedToken(best, now)];
		if (
			rank > bestRank ||
			(rank === bestRank &&
				(candidate.expiresAt ?? Number.POSITIVE_INFINITY) >
					(best.expiresAt ?? Number.POSITIVE_INFINITY))
		) {
			best = candidate;
		}
	}
	return best;
}

/** Identity of the default login, readable even when its token is expired. */
export async function readDefaultLoginEmail(
	strict = false,
): Promise<string | null> {
	try {
		const raw = strict
			? await readQuotaCredentialFile(
					join(homedir(), ".claude.json"),
					50 * 1024 * 1024,
				)
			: await readFile(join(homedir(), ".claude.json"), "utf-8");
		if (raw === null) return null;
		const parsed = (
			strict ? parseQuotaCredentialJson(raw) : JSON.parse(raw)
		) as { oauthAccount?: { emailAddress?: string } };
		return parsed.oauthAccount?.emailAddress ?? null;
	} catch {
		if (strict) throw new QuotaCredentialReadError();
		return null;
	}
}

export async function readProfileCredential(
	profile: Awaited<ReturnType<typeof discoverClaudeProfiles>>[number],
	strict = false,
): Promise<ClaudeOauthCredential | null> {
	const fromFile = await readCredentialFile(
		profile.credentialsPath,
		profile.sourceLabel,
		profile.configDir,
		strict,
	);
	const candidates: Array<ClaudeOauthCredential | null> = [fromFile];
	const serviceSecrets = await Promise.all(
		profile.keychainServices.map((service) =>
			readKeychainSecrets(service, strict),
		),
	);
	for (const secrets of serviceSecrets) {
		for (const secret of secrets) {
			candidates.push(
				parseCredential(
					secret,
					profile.configDir,
					profile.sourceLabel,
					profile.configDir,
					strict,
				),
			);
		}
	}
	const freshest = pickFreshest(candidates);
	return freshest ? { ...freshest, email: profile.email } : null;
}

export async function readClaudeLoginFingerprint(
	configDir: string | null,
): Promise<string | null> {
	const credential =
		configDir === null
			? pickFreshest(
					await Promise.all([
						readKeychainCredential(),
						readCredentialFile(
							join(homedir(), ".claude", ".credentials.json"),
							"~/.claude",
							null,
						),
						readCredentialFile(
							join(homedir(), ".config", "claude", "credentials.json"),
							"~/.config/claude",
							null,
						),
					]),
				)
			: await readProfileCredential({
					configDir,
					sourceLabel: configDir,
					email: null,
					credentialKind: "subscription",
					loginFingerprint: null,
					credentialsPath: join(configDir, ".credentials.json"),
					keychainServices: keychainServicesForConfigDir(configDir),
				});
	return credential && classifyLapsedToken(credential) === "live"
		? createHash("sha256").update(credential.accessToken).digest("hex")
		: null;
}

/**
 * Discovers Claude logins on this machine: the default config locations,
 * any CLAUDE_CONFIG_DIR entries (comma-list supported), auto-discovered
 * profile dirs (runway's multi-account model — see profiles.ts), and the
 * Claude Code Keychain items. Deduped by token.
 *
 * The Keychain item, `~/.claude/.credentials.json`, and
 * `~/.config/claude/credentials.json` are ONE login slot: /login rewrites
 * whichever store the CLI prefers and leaves stale copies in the others, so
 * only the freshest of the three surfaces (a stale sibling would otherwise
 * render as a phantom expired account).
 */
interface ClaudeQuotaInputs {
	credentials: ClaudeOauthCredential[];
	signedOutProfiles: Awaited<ReturnType<typeof discoverClaudeProfiles>>;
	apiProfiles: Awaited<ReturnType<typeof discoverClaudeProfiles>>;
	unavailableSlots?: UnavailableQuotaSlot[];
}

interface ClaudeCredentialSlot {
	source: UnavailableQuotaSlot;
	read: () => Promise<ClaudeOauthCredential | null>;
	profile?: Awaited<ReturnType<typeof discoverClaudeProfiles>>[number];
}

/** Keep unreadable slots separate from signed-out profiles and healthy logins. */
export async function captureClaudeCredentialSlots(
	slots: ClaudeCredentialSlot[],
	apiProfiles: ClaudeQuotaInputs["apiProfiles"],
): Promise<ClaudeQuotaInputs> {
	const apiSelections = new Set(
		apiProfiles.map((profile) => profile.configDir),
	);
	const results = await Promise.all(
		slots
			.filter((slot) => !apiSelections.has(slot.source.selection ?? ""))
			.map(async (slot) => {
				try {
					return { slot, credential: await slot.read(), unavailable: false };
				} catch {
					return { slot, credential: null, unavailable: true };
				}
			}),
	);
	const credentials = new Map<string | null, ClaudeOauthCredential>();
	const unavailableSlots = new Map<string | null, UnavailableQuotaSlot>();
	const signedOutProfiles: ClaudeQuotaInputs["signedOutProfiles"] = [];
	for (const { slot, unavailable } of results) {
		if (unavailable) unavailableSlots.set(slot.source.selection, slot.source);
	}
	for (const { slot, credential, unavailable } of results) {
		if (unavailable || unavailableSlots.has(slot.source.selection)) continue;
		if (credential) {
			credentials.set(
				credential.selection,
				pickFreshest([
					credentials.get(credential.selection) ?? null,
					credential,
				]) ?? credential,
			);
		} else if (!credential && slot.profile)
			signedOutProfiles.push(slot.profile);
	}
	return {
		credentials: [...credentials.values()],
		signedOutProfiles,
		apiProfiles,
		unavailableSlots: [...unavailableSlots.values()],
	};
}

export async function readDefaultQuotaCredential(
	readCredentials: () => Promise<Array<ClaudeOauthCredential | null>>,
	readEmail = readDefaultLoginEmail,
): Promise<ClaudeOauthCredential | null> {
	const [email, credentials] = await Promise.all([
		readEmail(true).catch(() => null),
		readCredentials(),
	]);
	const credential = pickFreshest(credentials);
	return credential
		? { ...credential, email: credential.email ?? email }
		: null;
}

async function discoverClaudeCredentials(
	strict = false,
): Promise<ClaudeQuotaInputs> {
	const home = homedir();
	const defaultCandidates: Array<{ path: string; sourceLabel: string }> = [
		{
			path: join(home, ".claude", ".credentials.json"),
			sourceLabel: "~/.claude",
		},
		{
			path: join(home, ".config", "claude", "credentials.json"),
			sourceLabel: "~/.config/claude",
		},
	];
	const explicitCandidates: Array<{
		path: string;
		sourceLabel: string;
		configDir: string;
	}> = [];
	for (const dir of (process.env.CLAUDE_CONFIG_DIR ?? "").split(",")) {
		const configDir = dir.trim();
		if (!configDir) continue;
		explicitCandidates.push({
			path: join(configDir, ".credentials.json"),
			sourceLabel: configDir.replace(home, "~"),
			configDir,
		});
	}

	// API-billed profiles have no quota to fetch and their credentials stay
	// unread; only subscription profiles go through the credential readers.
	const allProfiles = await discoverClaudeProfiles();
	const profiles = allProfiles.filter(
		(profile) => profile.credentialKind === "subscription",
	);
	const apiProfiles = allProfiles.filter(
		(profile) => profile.credentialKind === "api_key",
	);
	if (strict) {
		return captureClaudeCredentialSlots(
			[
				{
					source: {
						agent: "claude",
						accountKey: `keychain:${CLAUDE_KEYCHAIN_SERVICE}`,
						sourceLabel: "Default Claude login",
						selection: null,
					},
					read: () =>
						readDefaultQuotaCredential(async () => {
							const [keychain, files] = await Promise.all([
								readKeychainCredential(true),
								Promise.all(
									defaultCandidates.map(({ path, sourceLabel }) =>
										readCredentialFile(path, sourceLabel, null, true),
									),
								),
							]);
							return [keychain, ...files];
						}),
				},
				...explicitCandidates.map(({ path, sourceLabel, configDir }) => ({
					source: {
						agent: "claude" as const,
						accountKey: path,
						sourceLabel,
						selection: configDir,
					},
					read: () => readCredentialFile(path, sourceLabel, configDir, true),
				})),
				...profiles.map((profile) => ({
					source: {
						agent: "claude" as const,
						accountKey: profile.configDir,
						sourceLabel: profile.sourceLabel,
						selection: profile.configDir,
					},
					read: () => readProfileCredential(profile, true),
					profile,
				})),
			],
			apiProfiles,
		);
	}
	const [defaultEmail, keychainCredential, defaultFiles, explicit, profiled] =
		await Promise.all([
			readDefaultLoginEmail(strict),
			readKeychainCredential(strict),
			Promise.all(
				defaultCandidates.map(({ path, sourceLabel }) =>
					readCredentialFile(path, sourceLabel, null, strict),
				),
			),
			Promise.all(
				explicitCandidates.map(({ path, sourceLabel, configDir }) =>
					readCredentialFile(path, sourceLabel, configDir, strict),
				),
			),
			Promise.all(
				profiles.map((profile) => readProfileCredential(profile, strict)),
			),
		]);

	const defaultCredential = pickFreshest([keychainCredential, ...defaultFiles]);
	if (defaultCredential && !defaultCredential.email && defaultEmail) {
		defaultCredential.email = defaultEmail;
	}

	const byProfile = new Map<string | null, ClaudeOauthCredential>();
	for (const credential of [defaultCredential, ...explicit, ...profiled]) {
		if (credential)
			byProfile.set(
				credential.selection,
				pickFreshest([
					byProfile.get(credential.selection) ?? null,
					credential,
				]) ?? credential,
			);
	}

	// Profiles with an identity but no readable credential (logged out, or a
	// login that died half-way) still surface so the UI can offer re-sign-in
	// and removal — otherwise the dir exists but nothing shows it.
	const signedOutProfiles = profiles.filter(
		(_profile, index) => profiled[index] === null,
	);
	return {
		credentials: [...byProfile.values()],
		signedOutProfiles,
		apiProfiles,
	};
}

export type { ClaudeSubscriptionQuota } from "./claude-subscription";
export { fetchClaudeSubscriptionQuota } from "./claude-subscription";

export const CLAUDE_QUOTA_POLL_MS = 60_000;
const accountQuotaCache = createCredentialQuotaCache<
	ClaudeSubscriptionQuota & { fetchedAt: Date }
>(CLAUDE_IDLE_QUOTA_POLL_MS);
const collectionQueue = createRestartableClaudeCollectionQueue();
export const onClaudeQuotaUpdate = collectionQueue.subscribe;
export const disposeClaudeQuotaCollection = collectionQueue.dispose;
type CollectionMode = "blocking" | "background" | "skip";
async function readNativeClaudeCredential(selection: string | null) {
	const directory = selection ?? join(homedir(), ".claude");
	const canonical = await canonicalQuotaProfile(directory);
	if (!canonical) return null;
	const credential =
		selection === null
			? await readDefaultQuotaCredential(() =>
					Promise.all([
						readKeychainCredential(true),
						readCredentialFile(
							join(homedir(), ".claude", ".credentials.json"),
							"~/.claude",
							null,
							true,
						),
						readCredentialFile(
							join(homedir(), ".config", "claude", "credentials.json"),
							"~/.config/claude",
							null,
							true,
						),
					]),
				)
			: await readProfileCredential(
					{
						configDir: selection,
						credentialsPath: join(selection, ".credentials.json"),
						sourceLabel: selection,
						email: null,
						credentialKind: "subscription",
						loginFingerprint: null,
						keychainServices: keychainServicesForConfigDir(selection),
					},
					true,
				);
	if (!credential || classifyLapsedToken(credential) !== "live") return null;
	const defaultDirectory = await canonicalQuotaProfile(
		join(homedir(), ".claude"),
	);
	const file =
		canonical === defaultDirectory
			? join(homedir(), ".claude.json")
			: join(directory, ".claude.json");
	const raw = await readQuotaCredentialFile(file, 50 * 1024 * 1024);
	if (raw === null) return null;
	const data = parseQuotaCredentialJson(raw);
	const account = data.oauthAccount as
		| { accountUuid?: unknown; emailAddress?: unknown }
		| undefined;
	if (
		typeof account?.accountUuid !== "string" ||
		!account.accountUuid ||
		typeof account.emailAddress !== "string" ||
		!account.emailAddress
	)
		return null;
	// Keep this tuple byte-for-byte aligned with session-account/readAccountIdentity.
	const registrationHash = createHash("sha256")
		.update(
			JSON.stringify([account.accountUuid, undefined, account.emailAddress]),
		)
		.digest("hex");
	return {
		accessToken: credential.accessToken,
		canonicalProfile: canonical,
		registrationHash,
	};
}
const nativeClaudeScope = createNativeClaudeScopeResolver({
	readCurrent: readNativeClaudeCredential,
	canonicalize: canonicalQuotaProfile,
	peekQuota: (accessToken) =>
		accountQuotaCache.peek(
			createHash("sha256")
				.update(JSON.stringify(["claude", accessToken]))
				.digest("hex"),
		)?.value,
});
export const captureNativeClaudeUsageGeneration =
	nativeClaudeScope.captureGeneration;
export const resolveNativeClaudeUsageScope = nativeClaudeScope.resolve;
const nativeQuotaOverlay = createNativeClaudeQuotaOverlay({
	enabled: () => process.env.SUPERSET_NATIVE_CLAUDE_USAGE === "1",
	generation: nativeClaudeCredentialGeneration,
	readCurrent: readNativeClaudeCredential,
	resolveScope: nativeClaudeScope.resolve,
	isCurrent: (accessToken, quota) =>
		accountQuotaCache.peek(
			createHash("sha256")
				.update(JSON.stringify(["claude", accessToken]))
				.digest("hex"),
		)?.value === quota,
	snapshot: (scope) => nativeClaudeUsage.snapshot(scope),
});

export async function getCredentialQuota(
	credential: ClaudeOauthCredential,
	forceRefresh = false,
	mode: CollectionMode = "blocking",
) {
	const accessToken = credential.accessToken;
	const key = createHash("sha256")
		.update(JSON.stringify([credential.selection, accessToken]))
		.digest("hex");
	const transport = createHash("sha256")
		.update(JSON.stringify(["claude", accessToken]))
		.digest("hex");
	const pollingMs = claudeQuotaPolling.interval(credential.selection ?? null);
	const cached = accountQuotaCache.peek(transport)?.value;
	const projectNative = async (
		quota: ClaudeSubscriptionQuota & { fetchedAt: Date },
	) => {
		const projected = await nativeQuotaOverlay(credential, quota);
		return projected
			? copyQuotaRetry(quota, copyQuotaIdentity(quota, projected))
			: null;
	};
	const passive = cached ? await projectNative(cached) : null;
	if (
		!forceRefresh &&
		passive &&
		cached &&
		canDeferClaudeHttpQuota(cached, passive)
	)
		return passive;
	const load = async (signal?: AbortSignal) =>
		accountQuotaCache.get(
			key,
			async () => {
				const profilePath = credential.selection ?? join(homedir(), ".claude");
				const canonical = await canonicalQuotaProfile(profilePath);
				const expected = createHash("sha256").update(accessToken).digest("hex");
				if (
					mode !== "blocking" &&
					(await readClaudeLoginFingerprint(credential.selection)) !== expected
				)
					throw new Error("Usage credentials changed before collection.");
				const quota = await fetchClaudeSubscriptionQuota(
					accessToken,
					undefined,
					{ canonicalProfile: canonical, signal },
				);
				if (
					mode !== "blocking" &&
					((await readClaudeLoginFingerprint(credential.selection)) !==
						expected ||
						(await canonicalQuotaProfile(profilePath)) !== canonical)
				)
					throw new Error("Usage credentials changed during collection.");
				return copyQuotaRetry(
					quota,
					copyQuotaIdentity(quota, {
						...quota,
						fetchedAt: quota.fetchedAt ?? new Date(),
					}),
				);
			},
			forceRefresh,
			transport,
			pollingMs,
		);
	if (mode === "blocking") {
		const loaded = await load();
		return (await projectNative(loaded)) ?? loaded;
	}
	if (
		mode !== "skip" &&
		(forceRefresh || !accountQuotaCache.fresh(transport, pollingMs))
	)
		void collectionQueue.enqueue(transport, load, forceRefresh).catch(() => {});
	return (
		passive ??
		cached ?? {
			email: credential.email ?? null,
			status: "unavailable" as const,
			statusDetail: "Usage is refreshing.",
			windows: [],
			extraUsage: null,
			fetchedAt: new Date(0),
		}
	);
}

export async function fetchClaudeAccount(
	credential: ClaudeOauthCredential,
	forceRefresh = false,
	mode: CollectionMode = "blocking",
): Promise<UsageAccount> {
	const base = {
		agent: "claude" as const,
		credentialKind: "subscription" as const,
		accountKey: credential.accountKey,
		sourceLabel: credential.sourceLabel,
		plan: credential.subscriptionType,
		creditsBalance: null,
		selection: credential.selection,
		// Decorated per-query from host settings; the quota cache outlives it.
		isDefault: false,
		fetchedAt: new Date(),
	};

	const lapsed = classifyLapsedToken(credential);
	if (lapsed !== "live") {
		return {
			...base,
			email: credential.email ?? null,
			status: lapsed,
			statusDetail:
				lapsed === "token_stale" ? STALE_TOKEN_DETAIL : EXPIRED_TOKEN_DETAIL,
			windows: [],
			extraUsage: null,
		};
	}

	const quota = await getCredentialQuota(credential, forceRefresh, mode);
	return copyQuotaRetry(
		quota,
		copyQuotaIdentity(quota, {
			...base,
			...quota,
			email: quota.email ?? credential.email ?? null,
		}),
	);
}

export async function fetchClaudeAccounts(): Promise<UsageAccount[]> {
	return fetchClaudeSnapshot(await discoverClaudeCredentials());
}

export async function captureClaudeQuotaSnapshot(
	capture = () => discoverClaudeCredentials(true),
	fetchAccount = fetchClaudeAccount,
): Promise<QuotaSnapshot<UsageAccount[]>> {
	let snapshot: ClaudeQuotaInputs;
	try {
		snapshot = structuredClone(
			await createQuotaRequestBudget(QUOTA_CAPTURE_BUDGET_MS).run(() =>
				capture(),
			),
		);
	} catch {
		snapshot = {
			credentials: [],
			signedOutProfiles: [],
			apiProfiles: [],
			unavailableSlots: [
				{
					agent: "claude",
					accountKey: "claude:discovery",
					sourceLabel: "Claude accounts",
					selection: null,
				},
			],
		};
	}
	const revision = createHash("sha256")
		.update(
			JSON.stringify([
				{
					...snapshot,
					credentials: snapshot.credentials.map(
						({ email: _email, ...credential }) => credential,
					),
				},
				snapshot.credentials.map((credential) =>
					classifyLapsedToken(credential),
				),
			]),
		)
		.digest("hex");
	return {
		revision,
		load: (forceRefresh = false) =>
			fetchClaudeSnapshot(snapshot, (credential) =>
				fetchAccount(credential, forceRefresh, "background"),
			),
	};
}

async function fetchClaudeSnapshot(
	{
		credentials,
		signedOutProfiles,
		apiProfiles,
		unavailableSlots = [],
	}: Awaited<ReturnType<typeof discoverClaudeCredentials>>,
	fetchAccount = fetchClaudeAccount,
): Promise<UsageAccount[]> {
	const accounts = [
		...(await Promise.all(
			credentials.map((credential) =>
				fetchAccount(credential, false, "background").catch(() =>
					unavailableQuotaAccount({
						agent: "claude",
						accountKey: credential.accountKey,
						sourceLabel: credential.sourceLabel,
						selection: credential.selection,
					}),
				),
			),
		)),
		...unavailableSlots.map(unavailableQuotaAccount),
	];
	for (const profile of apiProfiles) {
		accounts.push({
			agent: "claude",
			credentialKind: "api_key",
			accountKey: profile.configDir,
			sourceLabel: profile.sourceLabel,
			email: profile.email,
			plan: null,
			status: "ok",
			statusDetail:
				"Billed per token through the Anthropic Console — no quota windows.",
			windows: [],
			creditsBalance: null,
			extraUsage: null,
			selection: profile.configDir,
			isDefault: false,
			fetchedAt: new Date(),
		});
	}
	for (const profile of signedOutProfiles) {
		accounts.push({
			agent: "claude",
			credentialKind: "subscription",
			accountKey: profile.configDir,
			sourceLabel: profile.sourceLabel,
			email: profile.email,
			plan: null,
			status: "signed_out",
			statusDetail:
				"Signed out — use Switch sign-in to reconnect, or Remove to delete this profile.",
			windows: [],
			creditsBalance: null,
			extraUsage: null,
			selection: profile.configDir,
			isDefault: false,
			fetchedAt: new Date(),
		});
	}
	return accounts;
}
