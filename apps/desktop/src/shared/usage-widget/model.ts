import type { AppRouter } from "@superset/host-service";
import type { inferRouterOutputs } from "@trpc/server";
import { z } from "zod";
import {
	quotaWindowReading,
	usageObservation,
	usageReading,
} from "../usage-reading";

type HostOutputs = inferRouterOutputs<AppRouter>;
export type QuotaAccount = HostOutputs["usage"]["quota"][number];
export const PROVIDERS = [
	"claude",
	"codex",
	"grok",
	"agy",
	"opencode",
] as const;
export type WidgetProvider = (typeof PROVIDERS)[number];
export const PROVIDER_NAMES: Record<WidgetProvider, string> = {
	claude: "Claude",
	codex: "Codex",
	grok: "Grok",
	agy: "Antigravity",
	opencode: "OpenCode",
};
export const widgetPreferencesSchema = z.object({
	celebrateResets: z.boolean(),
	menuBar: z.enum(["logo", "providers", "off"]),
	edge: z.boolean(),
	displayId: z.number().int().nullable(),
	hostId: z.string().max(200).nullable(),
	hideEmails: z.boolean(),
	metric: z.enum(["remaining", "used"]),
	window: z.enum(["session", "weekly"]),
	providers: z
		.array(z.enum(PROVIDERS))
		.max(5)
		.transform((values) => [...new Set(values)]),
	pinnedAccounts: z.partialRecord(z.enum(PROVIDERS), z.string().max(300)),
	hiddenAccountIds: z
		.array(z.string().min(1).max(300))
		.max(5000)
		.transform((ids) => [...new Set(ids)]),
});
export const widgetPreferencesPatchSchema = widgetPreferencesSchema.partial();
export type WidgetPreferences = z.infer<typeof widgetPreferencesSchema>;
export const DEFAULT_WIDGET_PREFERENCES: WidgetPreferences = {
	celebrateResets: false,
	menuBar: "off",
	edge: false,
	displayId: null,
	hostId: null,
	hideEmails: true,
	metric: "remaining",
	window: "weekly",
	providers: ["claude", "codex"],
	pinnedAccounts: {},
	hiddenAccountIds: [],
};
export function readWidgetPreferences(value: unknown): WidgetPreferences {
	const defaults = structuredClone(DEFAULT_WIDGET_PREFERENCES);
	const result = widgetPreferencesSchema.safeParse({
		...defaults,
		...(value && typeof value === "object" ? value : {}),
	});
	return result.success ? result.data : defaults;
}
export interface WidgetWindow {
	id: string;
	label: string;
	windowSeconds?: number;
	usedPercent: number;
	resetsAt: string | null;
	observedAt?: string | null;
	source?: "provider" | "claude_statusline" | "claude_sdk";
}
export interface WidgetAccount {
	quotaIdentity?: string;
	creditsBalance?: number | null;
	prepaidBalance?: {
		amount: number;
		currency: string | null;
		checkedAt: string;
	};
	retryAt?: string | null;
	color?: string | null;
	resetCredits?: {
		availableCount: number | null;
		expirations: Array<string | null> | null;
		checkedAt: string;
	};
	resetNotice?: { id: string; kind: "session" | "weekly"; confirmedAt: string };
	id: string;
	provider: WidgetProvider;
	label: string;
	email: string | null;
	plan: string | null;
	isDefault: boolean;
	status: QuotaAccount["status"];
	identityChanged: boolean;
	billing: QuotaAccount["credentialKind"];
	windows: WidgetWindow[];
	checkedAt: string | null;
	historical: boolean;
}
export interface WidgetSnapshot {
	preferences: WidgetPreferences;
	accounts: WidgetAccount[];
	hosts: { id: string; label: string }[];
	hostId: string | null;
	hostUrl?: string | null;
	displays: { id: number; label: string }[];
	loading: boolean;
	offline: boolean;
	inventoryUnavailable?: boolean;
	locale: string;
	dark: boolean;
	colors?: Record<string, string>;
	expanded: boolean;
	panelHeight: number;
	edgeTransition: number | null;
	edgeLayout?: ReturnType<typeof edgeHandleLayout>;
	provider: WidgetProvider | null;
	surface: "menu" | "edge";
	preview?: string | null;
	celebration?: { kind: "session" | "weekly"; label: string } | null;
}
function date(value: Date | string | null | undefined): string | null {
	if (!value) return null;
	const d = new Date(value);
	return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
export function widgetAccountId(account: QuotaAccount): string {
	return `${account.agent}:${account.quotaIdentity ?? account.sourceId ?? account.accountKey}`;
}
export type WidgetAppearances = Record<
	string,
	{ color: string | null; label: string | null }
>;
export function projectWidgetAccounts(
	quota: QuotaAccount[],
	appearances: WidgetAppearances = {},
	offline = false,
): WidgetAccount[] {
	return quota
		.filter((account) => !account.discoveryFailed)
		.map((account) => {
			const id = widgetAccountId(account);
			const appearance = account.quotaIdentity ? appearances[id] : undefined;
			const observation = usageObservation(account);
			const historical = offline || observation.historical;
			return {
				id,
				quotaIdentity: account.quotaIdentity,
				creditsBalance: account.creditsBalance,
				prepaidBalance: account.prepaidBalance
					? {
							...account.prepaidBalance,
							checkedAt: date(account.prepaidBalance.checkedAt) ?? "",
						}
					: undefined,
				retryAt: date(account.retryAt),
				color: appearance?.color,
				provider: account.agent,
				label: appearance?.label ?? account.email ?? account.sourceLabel,
				email: account.email,
				plan: account.plan,
				isDefault: account.isDefault,
				status: account.status,
				identityChanged: false,
				billing: account.credentialKind,
				windows: observation.windows
					.filter((window) => Number.isFinite(window.usedPercent))
					.map((window) => ({
						id: window.id,
						label: window.label,
						windowSeconds: window.windowSeconds,
						usedPercent: Math.max(0, Math.min(100, window.usedPercent)),
						resetsAt: date(window.resetsAt),
						observedAt: date(window.observedAt),
						source: window.source,
					})),
				checkedAt: date(observation.checkedAt),
				resetCredits:
					!offline && account.status === "ok" && account.resetCredits
						? {
								...account.resetCredits,
								checkedAt: date(account.resetCredits.checkedAt) ?? "",
								expirations:
									account.resetCredits.expirations?.map(date) ?? null,
							}
						: undefined,
				resetNotice:
					!offline && account.status === "ok" && account.resetNotice
						? {
								...account.resetNotice,
								confirmedAt: date(account.resetNotice.confirmedAt) ?? "",
							}
						: undefined,
				historical,
			};
		});
}
export function isFresh(
	account: WidgetAccount,
	offline: boolean,
	now = Date.now(),
): boolean {
	return widgetUsageReading(account, offline, now).freshness === "fresh";
}
export function widgetUsageReading(
	account: WidgetAccount,
	offline: boolean,
	now = Date.now(),
) {
	return usageReading(account, offline, now);
}
export function isCurrentWindow(
	account: WidgetAccount,
	window: WidgetWindow,
	offline: boolean,
	now = Date.now(),
) {
	return (
		quotaWindowReading(
			widgetUsageReading(account, offline, now),
			window,
			now,
		) === "current"
	);
}
export function selectedAccount(
	accounts: WidgetAccount[],
	provider: WidgetProvider,
	preferences: WidgetPreferences,
): WidgetAccount | undefined {
	const pin = preferences.pinnedAccounts[provider];
	const candidates = accounts.filter((a) => a.provider === provider);
	return pin
		? candidates.find((a) => a.id === pin)
		: (candidates.find((a) => a.isDefault) ??
				(candidates.length === 1 ? candidates[0] : undefined));
}
export function selectedWindow(
	account: Pick<WidgetAccount, "windows">,
	window: WidgetPreferences["window"],
): WidgetWindow | undefined {
	const ids =
		window === "session" ? ["five_hour", "session"] : ["seven_day", "weekly"];
	return account.windows.find(
		(w) =>
			ids.includes(w.id) ||
			(["primary", "secondary"].includes(w.id) &&
				typeof w.windowSeconds === "number" &&
				(window === "weekly"
					? w.windowSeconds === 604800
					: w.windowSeconds > 0 && w.windowSeconds <= 18000)),
	);
}
export function displayWindows(windows: WidgetWindow[]): WidgetWindow[] {
	const account = { windows };
	const preferred = [
		selectedWindow(account, "session"),
		selectedWindow(account, "weekly"),
	].filter((window): window is WidgetWindow => window !== undefined);
	return [
		...preferred,
		...windows.filter((window) => !preferred.includes(window)),
	];
}

export function preferredWindow(
	account: Pick<WidgetAccount, "windows">,
	period: WidgetPreferences["window"],
): WidgetWindow | undefined {
	return selectedWindow(account, period) ?? displayWindows(account.windows)[0];
}

export function exhaustedQuota(
	account: WidgetAccount,
	offline: boolean,
	now = Date.now(),
): { resetsAt: number | null } | null {
	const exhausted = (["session", "weekly"] as const)
		.map((period) => selectedWindow(account, period))
		.filter((window): window is WidgetWindow =>
			Boolean(
				window &&
					isCurrentWindow(account, window, offline, now) &&
					window.usedPercent >= 100,
			),
		);
	if (!exhausted.length) return null;
	const resets = exhausted.map((window) =>
		window.resetsAt ? new Date(window.resetsAt).getTime() : NaN,
	);
	return {
		resetsAt: resets.every(Number.isFinite) ? Math.max(...resets) : null,
	};
}

export function quotaColor(usedPercent: number): string {
	const remaining = Math.max(0, Math.min(100, 100 - usedPercent));
	if (remaining <= 10) return "#ff4d5e";
	if (remaining <= 25) return "#fb923c";
	if (remaining <= 50) return "#facc15";
	return "#4ade80";
}

export function metricValue(
	window: WidgetWindow,
	metric: WidgetPreferences["metric"],
): number {
	const n =
		metric === "remaining" ? 100 - window.usedPercent : window.usedPercent;
	return Math.floor(n);
}
export function panelBounds(
	work: { x: number; y: number; width: number; height: number },
	anchor: { x: number; y: number; width: number; height: number },
	surface: "menu" | "edge",
	expanded: boolean,
	count: number,
	preferredHeight = 548,
	physicalScreen = work,
) {
	const edge = edgeHandleLayout(count, work);
	const width = Math.min(expanded ? 392 : edge.width, work.width);
	const height = Math.min(
		expanded ? Math.max(160, Math.min(548, preferredHeight)) : edge.height,
		work.height,
	);
	return {
		width,
		height,
		x:
			surface === "edge"
				? physicalScreen.x + physicalScreen.width - width
				: Math.max(
						work.x,
						Math.min(
							anchor.x + anchor.width - width,
							work.x + work.width - width,
						),
					),
		y:
			surface === "edge"
				? work.y + Math.round((work.height - height) / 2)
				: Math.max(
						work.y,
						Math.min(
							anchor.y + anchor.height + 6,
							work.y + work.height - height,
						),
					),
	};
}

export function edgeHandleHeight(count: number) {
	return 62 + Math.max(0, count) * 52;
}

export function edgeHandleLayout(
	count: number,
	work: { width: number; height: number },
) {
	const items = Math.max(0, Math.floor(count));
	const availableHeight = Math.max(0, work.height - 62);
	const maxRows = Math.max(1, Math.floor(availableHeight / 50));
	const columns = Math.min(
		Math.max(1, Math.floor(work.width / 46)),
		Math.max(1, Math.ceil(items / maxRows)),
	);
	const rows = Math.ceil(items / columns);
	const itemHeight = Math.max(
		50,
		Math.min(52, Math.floor(availableHeight / Math.max(1, rows))),
	);
	return {
		width: Math.min(work.width, columns * 46),
		height: Math.min(work.height, 62 + rows * itemHeight),
		columns,
		rows,
		itemHeight,
	};
}

export function edgeAccounts(
	accounts: WidgetAccount[],
	preferences: WidgetPreferences,
) {
	const hidden = new Set(preferences.hiddenAccountIds);
	return PROVIDERS.flatMap((provider) =>
		accounts.filter((a) => a.provider === provider && !hidden.has(a.id)),
	);
}

export function setWidgetAccountHidden(
	accounts: WidgetAccount[],
	preferences: WidgetPreferences,
	id: string,
	hidden: boolean,
) {
	if (!accounts.some((a) => a.id === id))
		throw new Error("Account unavailable");
	const ids = new Set(preferences.hiddenAccountIds);
	if (hidden) ids.add(id);
	else ids.delete(id);
	return [...ids];
}

export function widgetAccountInitials(
	account: WidgetAccount,
	accounts: WidgetAccount[],
	hideEmails: boolean,
) {
	const peers = accounts.filter((a) => a.provider === account.provider);
	const initials = (a: WidgetAccount) => {
		const label = widgetAccountLabel(
			a,
			peers.findIndex((p) => p.id === a.id),
			hideEmails,
		);
		if (/^#\d+$/.test(label)) return label.slice(1);
		const words =
			label.replace(/([a-z])([A-Z])/g, "$1 $2").match(/[\p{L}\p{N}]+/gu) ?? [];
		return (
			words.length > 1
				? words
						.slice(0, 2)
						.map((w) => Array.from(w)[0])
						.join("")
				: Array.from(words[0] ?? "?")
						.slice(0, 2)
						.join("")
		).toLocaleUpperCase();
	};
	const base = initials(account);
	const duplicates = peers
		.filter((a) => initials(a) === base)
		.sort((a, b) => a.id.localeCompare(b.id));
	return duplicates.length > 1
		? `${Array.from(base)[0]}${(duplicates.findIndex((a) => a.id === account.id) + 1).toString(36).toUpperCase()}`
		: base;
}

export function widgetAccountLabel(
	account: WidgetAccount,
	index: number,
	hideEmails: boolean,
) {
	return hideEmails
		? account.label.replace(/\S+@\S+/g, `#${index + 1}`)
		: account.label;
}
export function widgetAccountGroups(
	accounts: WidgetAccount[],
	preferences: WidgetPreferences,
	search: string,
	filter: WidgetProvider | null,
	showHidden = false,
) {
	const needle = search.trim().toLocaleLowerCase();
	return PROVIDERS.filter((provider) => !filter || provider === filter).map(
		(provider) => {
			const all = accounts.filter((a) => a.provider === provider);
			const selected = selectedAccount(all, provider, preferences);
			return {
				provider,
				total: all.length,
				accounts: all
					.map((account, index) => ({
						account,
						index,
						label: widgetAccountLabel(account, index, preferences.hideEmails),
						selected: selected?.id === account.id,
						hidden: preferences.hiddenAccountIds.includes(account.id),
					}))
					.filter(({ hidden }) => showHidden || !hidden)
					.filter(({ account, label }) =>
						`${label} ${preferences.hideEmails ? "" : (account.email ?? "")}`
							.toLocaleLowerCase()
							.includes(needle),
					),
			};
		},
	);
}
