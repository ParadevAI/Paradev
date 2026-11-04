import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { app, ipcMain, type Session } from "electron";
import {
	DNR_CHANNEL,
	DNR_METHODS,
	type DnrMethod,
} from "shared/browser-extension-dnr";
import { urlMatchesPattern, webRequestHub } from "../../web-request-hub";
import { toDnrRequest } from "./electron-request";
import { DnrEngine } from "./engine";
import {
	ExtensionRules,
	type PersistedRules,
	type RulesStorage,
	StaticRulePool,
} from "./extension-rules";
import { regexFilterProblem } from "./rule-validation";
import type {
	DnrRequest,
	HeaderChange,
	MatchedRule,
	RulesetSource,
} from "./types";

const WEB_URLS = ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"];
const MATCHED_RULES_LIMIT = 1_000;
const MATCHED_RULES_TTL_MS = 5 * 60_000;
// Saves still in flight from unloaded instances, per extension ID.
const draining = new Map<string, Set<Promise<unknown>>>();

/** Holds back deleteExtensionRules for `extensionId` until `pending` settles. */
export function drainBeforeDelete(
	extensionId: string,
	pending: Promise<unknown>,
): void {
	let set = draining.get(extensionId);
	if (!set) {
		set = new Set();
		draining.set(extensionId, set);
	}
	const tracked = pending
		.catch(() => undefined)
		.finally(() => {
			set.delete(tracked);
			if (set.size === 0 && draining.get(extensionId) === set) {
				draining.delete(extensionId);
			}
		});
	set.add(tracked);
}

interface DnrManifest {
	permissions?: string[];
	host_permissions?: string[];
	declarative_net_request?: { rule_resources?: Partial<RulesetSource>[] };
}

interface MatchedRuleInfo {
	rule: { ruleId: number; rulesetId: string };
	tabId: number;
	timeStamp: number;
}

interface LoadedExtension {
	extension: Electron.Extension;
	rules: ExtensionRules;
	ready: Promise<void>;
	matched: MatchedRuleInfo[];
}

export interface DnrHostOptions {
	/** Permissions and origins granted now, including at runtime. */
	grantedAccess(extension: Electron.Extension): string[];
}

function matchedRuleKey(rule: MatchedRule): string {
	return `${rule.extensionId}\n${rule.rulesetId}\n${rule.ruleId}`;
}

function rulesDirectory(): string {
	return path.join(app.getPath("userData"), "browser-extension-rules");
}

function fileStorage(extensionId: string): RulesStorage {
	const file = path.join(rulesDirectory(), `${extensionId}.json`);
	return {
		load: async () => {
			let text: string;
			try {
				text = await readFile(file, "utf8");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
				throw error;
			}
			try {
				return JSON.parse(text) as PersistedRules;
			} catch {
				// Corrupt for good: keep a copy and start over.
				console.error(`[dnr] ${file} is not valid JSON; moved aside`);
				await rename(file, `${file}.corrupt`).catch(() => {});
				return null;
			}
		},
		save: async (rules) => {
			await mkdir(rulesDirectory(), { recursive: true });
			const temp = `${file}.${randomUUID()}.tmp`;
			try {
				await writeFile(temp, JSON.stringify(rules));
				await rename(temp, file);
			} catch (error) {
				await rm(temp, { force: true }).catch(() => {});
				throw error;
			}
		},
	};
}

export async function deleteExtensionRules(extensionId: string): Promise<void> {
	await Promise.all(draining.get(extensionId) ?? []);
	await rm(path.join(rulesDirectory(), `${extensionId}.json`), { force: true });
}

function rulesetSources(manifest: DnrManifest): RulesetSource[] {
	const sources: RulesetSource[] = [];
	for (const source of manifest.declarative_net_request?.rule_resources ?? []) {
		if (typeof source?.id !== "string" || typeof source.path !== "string") {
			continue;
		}
		sources.push({
			id: source.id,
			path: source.path,
			enabled: source.enabled === true,
		});
	}
	return sources;
}

function readRulesetFile(extension: Electron.Extension) {
	return async (relativePath: string): Promise<unknown> => {
		const root = path.resolve(extension.path);
		const file = path.resolve(root, relativePath.replace(/^\/+/, ""));
		if (!file.startsWith(root + path.sep)) {
			throw new Error(`Ruleset path is outside the extension: ${relativePath}`);
		}
		return JSON.parse(await readFile(file, "utf8"));
	};
}

function applyRequestHeaders(
	headers: Record<string, string>,
	changes: HeaderChange[],
): Record<string, string> {
	const next = { ...headers };
	const keyOf = (name: string) =>
		Object.keys(next).find((key) => key.toLowerCase() === name.toLowerCase());
	for (const change of changes) {
		const key = keyOf(change.header);
		if (change.operation === "remove") {
			if (key) delete next[key];
		} else if (change.operation === "set" || !key) {
			if (key) delete next[key];
			next[change.header] = change.value ?? "";
		} else {
			const separator = key.toLowerCase() === "cookie" ? "; " : ", ";
			next[key] = `${next[key]}${separator}${change.value ?? ""}`;
		}
	}
	return next;
}

function applyResponseHeaders(
	headers: Record<string, string[]>,
	changes: HeaderChange[],
): Record<string, string[]> {
	const next = { ...headers };
	const keysOf = (name: string) =>
		Object.keys(next).filter((key) => key.toLowerCase() === name.toLowerCase());
	for (const change of changes) {
		const keys = keysOf(change.header);
		if (change.operation === "append") {
			const key = keys[0] ?? change.header;
			next[key] = [...(next[key] ?? []), change.value ?? ""];
			continue;
		}
		for (const key of keys) delete next[key];
		if (change.operation === "set") next[change.header] = [change.value ?? ""];
	}
	return next;
}

/**
 * Electron registers chrome.declarativeNetRequest but never consults its
 * rules when loading a request. This keeps each extension's rules in main and
 * enforces them through the session's webRequest hooks.
 */
export function enforceDeclarativeNetRequest(
	session: Session,
	options: DnrHostOptions,
): void {
	const engine = new DnrEngine();
	const pool = new StaticRulePool();
	const loaded = new Map<string, LoadedExtension>();
	const hub = webRequestHub(session);
	let removeRequestHook: (() => void) | null = null;
	let removeHeaderHooks: (() => void) | null = null;

	const evaluate = (
		details: Parameters<typeof toDnrRequest>[0],
	): ReturnType<DnrEngine["evaluate"]> | null => {
		const request = toDnrRequest(details);
		if (!request) return null;
		return engine.evaluate(request);
	};

	const record = (matched: MatchedRule[], tabId: number) => {
		const timeStamp = Date.now();
		for (const match of matched) {
			const list = loaded.get(match.extensionId)?.matched;
			if (!list) continue;
			list.push({
				rule: { ruleId: match.ruleId, rulesetId: match.rulesetId },
				tabId,
				timeStamp,
			});
			if (list.length > MATCHED_RULES_LIMIT) list.shift();
		}
	};

	const syncHooks = () => {
		if (engine.isEmpty) {
			removeRequestHook?.();
			removeRequestHook = null;
		} else {
			removeRequestHook ??= hub.add({
				urls: WEB_URLS,
				onBeforeRequest: (details) => {
					const decision = evaluate(details);
					if (!decision) return undefined;
					const { outcome } = decision;
					record(decision.matched, details.webContentsId ?? -1);
					if (outcome.kind === "block") return { cancel: true };
					if (outcome.kind === "redirect") return { redirectURL: outcome.url };
					return undefined;
				},
			});
		}
		if (!engine.hasModifyHeaders) {
			removeHeaderHooks?.();
			removeHeaderHooks = null;
			return;
		}
		removeHeaderHooks ??= hub.add({
			urls: WEB_URLS,
			onBeforeSendHeaders: (details, headers) => {
				const decision = evaluate(details);
				if (!decision?.requestHeaders.length) return undefined;
				record(decision.requestHeaderRules, details.webContentsId ?? -1);
				return applyRequestHeaders(headers, decision.requestHeaders);
			},
			onHeadersReceived: (details, headers) => {
				const decision = evaluate(details);
				if (!decision?.responseHeaders.length) return undefined;
				// Rules that also changed request headers were recorded then.
				const recorded = new Set(
					decision.requestHeaderRules.map(matchedRuleKey),
				);
				record(
					decision.responseHeaderRules.filter(
						(rule) => !recorded.has(matchedRuleKey(rule)),
					),
					details.webContentsId ?? -1,
				);
				return applyResponseHeaders(headers, decision.responseHeaders);
			},
		});
	};

	const publish = (entry: LoadedExtension) => {
		if (loaded.get(entry.extension.id) !== entry) return;
		const { extension } = entry;
		const manifest = extension.manifest as DnrManifest;
		const permissions = manifest.permissions ?? [];
		engine.setExtension({
			extensionId: extension.id,
			rulesets: entry.rules.rulesets(),
			hasHostAccess: (raw) => {
				let url: URL;
				try {
					url = new URL(raw);
				} catch {
					return false;
				}
				return options
					.grantedAccess(extension)
					.some((pattern) => urlMatchesPattern(pattern, url));
			},
			hostAccessForAllActions: !permissions.includes("declarativeNetRequest"),
			resolveExtensionPath: (extensionPath) =>
				`chrome-extension://${extension.id}${extensionPath}`,
		});
		syncHooks();
	};

	const load = (extension: Electron.Extension) => {
		const manifest = extension.manifest as DnrManifest;
		const permissions = manifest.permissions ?? [];
		if (
			!permissions.includes("declarativeNetRequest") &&
			!permissions.includes("declarativeNetRequestWithHostAccess")
		) {
			return;
		}
		const rules = new ExtensionRules(
			extension.id,
			extension.version,
			rulesetSources(manifest),
			fileStorage(extension.id),
			readRulesetFile(extension),
			pool,
		);
		const entry: LoadedExtension = {
			extension,
			rules,
			matched: [],
			ready: Promise.resolve(),
		};
		loaded.set(extension.id, entry);
		const started = performance.now();
		entry.ready = rules.load().then(
			() => {
				publish(entry);
				const ruleCount = rules
					.rulesets()
					.reduce((sum, ruleset) => sum + ruleset.size, 0);
				console.log(
					`[dnr] ${extension.name}: ${ruleCount} rules in ${rules.getEnabledRulesets().length} rulesets, indexed in ${Math.round(performance.now() - started)} ms`,
				);
			},
			(error: unknown) => {
				console.error(`[dnr] ${extension.name} rules did not load:`, error);
			},
		);
	};

	const unload = (extensionId: string) => {
		const entry = loaded.get(extensionId);
		if (entry) drainBeforeDelete(extensionId, entry.rules.dispose());
		loaded.delete(extensionId);
		engine.removeExtension(extensionId);
		syncHooks();
	};

	const testMatchOutcome = (extensionId: string, raw: unknown) => {
		const details = (raw ?? {}) as {
			url?: string;
			initiator?: string;
			method?: string;
			type?: DnrRequest["resourceType"];
			tabId?: number;
			topUrl?: string;
		};
		if (typeof details.url !== "string" || !details.type) {
			throw new Error("testMatchOutcome needs a url and a type.");
		}
		const decision = engine.evaluate({
			url: details.url,
			initiator: details.initiator,
			method: details.method ?? "get",
			resourceType: details.type,
			tabId: details.tabId ?? -1,
			frameUrls:
				details.type !== "main_frame" && typeof details.topUrl === "string"
					? [details.topUrl]
					: [],
		});
		const matched = new Map(
			[
				...decision.matched,
				...decision.requestHeaderRules,
				...decision.responseHeaderRules,
			].map((rule) => [matchedRuleKey(rule), rule]),
		);
		return {
			matchedRules: [...matched.values()]
				.filter((match) => match.extensionId === extensionId)
				.map(({ ruleId, rulesetId }) => ({ ruleId, rulesetId })),
		};
	};

	const call = async (
		extensionId: string,
		method: DnrMethod,
		args: unknown[],
	): Promise<unknown> => {
		const entry = loaded.get(extensionId);
		if (!entry) {
			throw new Error(
				"The extension needs the declarativeNetRequest permission.",
			);
		}
		await entry.ready;
		const { rules } = entry;
		const [first] = args as [Record<string, never> | undefined];
		const changed = async (update: Promise<void>) => {
			await update;
			publish(entry);
		};
		switch (method) {
			case "getEnabledRulesets":
				return rules.getEnabledRulesets();
			case "getAvailableStaticRuleCount":
				return rules.getAvailableStaticRuleCount();
			case "getDisabledRuleIds":
				return rules.getDisabledRuleIds(String(first?.rulesetId));
			case "getDynamicRules":
				return rules.getDynamicRules(first);
			case "getSessionRules":
				return rules.getSessionRules(first);
			case "updateEnabledRulesets":
				return changed(rules.updateEnabledRulesets(first ?? {}));
			case "updateStaticRules":
				return changed(rules.updateStaticRules((first ?? {}) as never));
			case "updateDynamicRules":
				return changed(rules.updateDynamicRules(first ?? {}));
			case "updateSessionRules":
				return changed(rules.updateSessionRules(first ?? {}));
			case "isRegexSupported": {
				const reason = regexFilterProblem(
					(first as { regex?: unknown } | undefined)?.regex,
				);
				return reason ? { isSupported: false, reason } : { isSupported: true };
			}
			case "setExtensionActionOptions":
				return undefined;
			case "getMatchedRules": {
				if (
					!options
						.grantedAccess(entry.extension)
						.includes("declarativeNetRequestFeedback")
				) {
					throw new Error(
						"The extension needs the declarativeNetRequestFeedback permission.",
					);
				}
				const filter = first as
					| { tabId?: number; minTimeStamp?: number }
					| undefined;
				const expired = Date.now() - MATCHED_RULES_TTL_MS;
				const firstLive = entry.matched.findIndex(
					(info) => info.timeStamp >= expired,
				);
				entry.matched.splice(
					0,
					firstLive === -1 ? entry.matched.length : firstLive,
				);
				return {
					rulesMatchedInfo: entry.matched.filter(
						(info) =>
							(filter?.tabId === undefined || info.tabId === filter.tabId) &&
							(filter?.minTimeStamp === undefined ||
								info.timeStamp >= filter.minTimeStamp),
					),
				};
			}
			case "testMatchOutcome":
				return testMatchOutcome(extensionId, first);
		}
	};

	const handle = (extensionId: string, method: unknown, args: unknown) => {
		if (!DNR_METHODS.includes(method as DnrMethod)) {
			throw new Error(
				`Unknown declarativeNetRequest method: ${String(method)}`,
			);
		}
		return call(
			extensionId,
			method as DnrMethod,
			Array.isArray(args) ? args : [],
		);
	};

	session.extensions.on("extension-loaded", (_event, extension) => {
		unload(extension.id);
		load(extension);
	});
	session.extensions.on("extension-unloaded", (_event, extension) => {
		unload(extension.id);
	});
	for (const extension of session.extensions.getAllExtensions()) {
		load(extension);
	}

	const served = new WeakSet<Electron.ServiceWorkerMain>();
	session.serviceWorkers.on("running-status-changed", ({ versionId }) => {
		const worker = session.serviceWorkers.getWorkerFromVersionID(versionId);
		if (
			!worker?.scope.startsWith("chrome-extension://") ||
			served.has(worker)
		) {
			return;
		}
		served.add(worker);
		const extensionId = new URL(worker.scope).host;
		worker.ipc.handle(DNR_CHANNEL, (_event, method, args) =>
			handle(extensionId, method, args),
		);
	});
	ipcMain.handle(DNR_CHANNEL, (event, method, args) => {
		const frameUrl = event.senderFrame?.url ?? "";
		if (
			event.sender.session !== session ||
			!frameUrl.startsWith("chrome-extension://")
		) {
			throw new Error("declarativeNetRequest is only for extension pages.");
		}
		return handle(new URL(frameUrl).host, method, args);
	});
}
