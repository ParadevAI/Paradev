import { execFile } from "node:child_process";
import { devNull, platform, tmpdir } from "node:os";
import { promisify } from "node:util";
import { resolveCommand } from "@superset/shared/resolve-command";
import semver from "semver";
import type { UsageAccount, UsageQuotaWindow } from "./types";

const execFileAsync = promisify(execFile);
const BASE_URLS = [
	"https://daily-cloudcode-pa.googleapis.com",
	"https://cloudcode-pa.googleapis.com",
];
const FETCH_TIMEOUT_MS = 10_000;
const MIN_HEADLESS_USAGE_VERSION = "1.1.11";

const BUCKETS: Record<string, string> = {
	"gemini-5h": "Session — Gemini Models",
	"gemini-weekly": "Weekly — Gemini Models",
	"3p-5h": "Session — Claude and GPT Models",
	"3p-weekly": "Weekly — Claude and GPT Models",
};

interface AgyAuth {
	token?: {
		access_token?: string;
		expiry?: string | number;
	};
	email?: string;
}

function expiryMs(value: string | number | undefined): number {
	if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
	if (typeof value === "string") {
		const numeric = Number(value);
		if (Number.isFinite(numeric))
			return numeric < 1e12 ? numeric * 1000 : numeric;
		return Date.parse(value);
	}
	return Number.POSITIVE_INFINITY;
}

async function readAgyAuth(signal: AbortSignal): Promise<AgyAuth | null> {
	try {
		const { stdout } = await execFileAsync(
			"security",
			["find-generic-password", "-s", "gemini", "-a", "antigravity", "-w"],
			{ signal, timeout: 5_000 },
		);
		const raw = stdout.trim().replace(/^go-keyring-base64:/, "");
		const text = stdout.trim().startsWith("go-keyring-base64:")
			? Buffer.from(raw, "base64").toString("utf8")
			: raw;
		return JSON.parse(text) as AgyAuth;
	} catch {
		return null;
	}
}

export function mapAgyQuotaWindows(value: unknown): UsageQuotaWindow[] {
	const groups =
		typeof value === "object" && value !== null && "groups" in value
			? (value as { groups?: unknown }).groups
			: null;
	if (!Array.isArray(groups)) return [];
	const found = new Map<string, UsageQuotaWindow>();
	for (const group of groups) {
		if (!group || typeof group !== "object" || !("buckets" in group)) continue;
		const buckets = (group as { buckets?: unknown }).buckets;
		if (!Array.isArray(buckets)) continue;
		for (const bucket of buckets) {
			if (!bucket || typeof bucket !== "object") continue;
			const item = bucket as {
				bucketId?: unknown;
				remainingFraction?: unknown;
				resetTime?: unknown;
				id?: unknown;
				remaining_fraction?: unknown;
				reset_time?: unknown;
			};
			const id = item.bucketId ?? item.id;
			const remaining = item.remainingFraction ?? item.remaining_fraction;
			const resetTime = item.resetTime ?? item.reset_time;
			if (
				typeof id !== "string" ||
				!Object.hasOwn(BUCKETS, id) ||
				typeof remaining !== "number" ||
				!Number.isFinite(remaining)
			)
				continue;
			const reset = typeof resetTime === "string" ? new Date(resetTime) : null;
			found.set(id, {
				id,
				label: BUCKETS[id] as string,
				usedPercent: Math.round(
					(1 - Math.max(0, Math.min(1, remaining))) * 100,
				),
				resetsAt: reset && !Number.isNaN(reset.getTime()) ? reset : null,
			});
		}
	}
	return Object.keys(BUCKETS).flatMap((id) => {
		const window = found.get(id);
		return window ? [window] : [];
	});
}

export function mapAgyCliQuotaWindows(value: unknown): UsageQuotaWindow[] {
	if (
		!value ||
		typeof value !== "object" ||
		!("status" in value) ||
		value.status !== "SUCCESS" ||
		!("command" in value)
	)
		return [];
	const command = value.command;
	if (
		!command ||
		typeof command !== "object" ||
		!("name" in command) ||
		command.name !== "usage" ||
		!("data" in command)
	)
		return [];
	return mapAgyQuotaWindows(command.data);
}

async function readAgyCliQuota(
	signal: AbortSignal,
): Promise<UsageQuotaWindow[]> {
	const executable = resolveCommand("agy");
	const cwd = tmpdir();
	try {
		const { stdout: versionText } = await execFileAsync(
			executable,
			["--version"],
			{ cwd, signal, timeout: 1_000 },
		);
		// Older releases pass /usage to the model in print mode.
		const version = semver.valid(versionText.trim());
		if (!version || semver.lt(version, MIN_HEADLESS_USAGE_VERSION)) return [];
		const { stdout } = await execFileAsync(
			executable,
			["--print", "/usage", "--output-format", "json", "--log-file", devNull],
			{ cwd, signal, timeout: 8_000, maxBuffer: 256 * 1024 },
		);
		return mapAgyCliQuotaWindows(JSON.parse(stdout));
	} catch {
		return [];
	}
}

export async function fetchAgyAccounts(): Promise<UsageAccount[]> {
	if (platform() !== "darwin") return [];
	const signal = AbortSignal.timeout(14_000);
	const account = {
		agent: "agy" as const,
		credentialKind: "subscription" as const,
		accountKey: "keychain:gemini:antigravity",
		plan: null,
		creditsBalance: null,
		extraUsage: null,
		selection: null,
		isDefault: false,
		fetchedAt: new Date(),
	};
	const cliWindows = await readAgyCliQuota(signal);
	if (cliWindows.length > 0) {
		return [
			{
				...account,
				sourceLabel: "Antigravity CLI",
				email: null,
				status: "ok",
				statusDetail: null,
				windows: cliWindows,
			},
		];
	}

	const auth = await readAgyAuth(signal);
	const accessToken = auth?.token?.access_token;
	if (!accessToken) return [];
	const base = {
		...account,
		sourceLabel: "Keychain",
		email: auth?.email ?? null,
	};
	const expiry = expiryMs(auth?.token?.expiry);
	if (Number.isFinite(expiry) && expiry <= Date.now()) {
		return [
			{
				...base,
				status: "token_expired",
				statusDetail: "Antigravity sign-in expired — run `agy` to refresh it.",
				windows: [],
			},
		];
	}
	try {
		let lastStatus = 0;
		for (const baseUrl of BASE_URLS) {
			const response = await fetch(
				`${baseUrl}/v1internal:retrieveUserQuotaSummary`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						"Content-Type": "application/json",
						"User-Agent": "antigravity",
					},
					body: "{}",
					signal: AbortSignal.any([
						signal,
						AbortSignal.timeout(FETCH_TIMEOUT_MS),
					]),
				},
			);
			lastStatus = response.status;
			if (response.status === 401 || response.status === 403) {
				return [
					{
						...base,
						status: "token_expired",
						statusDetail:
							"Antigravity sign-in expired — run `agy` to refresh it.",
						windows: [],
					},
				];
			}
			if (!response.ok) continue;
			const windows = mapAgyQuotaWindows(await response.json());
			if (windows.length > 0)
				return [{ ...base, status: "ok", statusDetail: null, windows }];
		}
		throw new Error(`Usage endpoint returned ${lastStatus || "no data"}.`);
	} catch (error) {
		return [
			{
				...base,
				status: "unavailable",
				statusDetail:
					error instanceof Error ? error.message : "Failed to fetch usage.",
				windows: [],
			},
		];
	}
}
