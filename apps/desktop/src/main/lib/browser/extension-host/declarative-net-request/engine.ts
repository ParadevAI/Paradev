import { type PreparedRequest, prepareRequest } from "./prepared-request";
import {
	type CompiledRule,
	newLookupStamp,
	type RulesetIndex,
	regexMatch,
} from "./ruleset-index";
import type {
	DnrDecision,
	DnrOutcome,
	DnrRequest,
	HeaderChange,
	HeaderInfo,
	MatchedRule,
	Redirect,
} from "./types";
import { applyUrlTransform } from "./url-transform";

export interface EngineExtension {
	extensionId: string;
	/** Enabled static rulesets, then dynamic, then session. */
	rulesets: RulesetIndex[];
	/** Whether the extension may see `url`, per its host permissions. */
	hasHostAccess(url: string): boolean;
	/** Holds only declarativeNetRequestWithHostAccess, so every action needs host access. */
	hostAccessForAllActions: boolean;
	/** The URL a redirect's `extensionPath` loads. */
	resolveExtensionPath(path: string): string;
}

interface ExtensionResult {
	action: CompiledRule | null;
	redirectUrl: string | null;
	headerRules: CompiledRule[];
}

const FRAME_CACHE_LIMIT = 1000;
const UPGRADEABLE = new Set(["http:", "ws:"]);
const NO_RESULT: ExtensionResult = {
	action: null,
	redirectUrl: null,
	headerRules: [],
};

function outranks(a: CompiledRule, b: CompiledRule | null): boolean {
	if (!b) return true;
	if (a.priority !== b.priority) return a.priority > b.priority;
	if (a.actionRank !== b.actionRank) return a.actionRank > b.actionRank;
	return a.rulesetRank > b.rulesetRank;
}

function originOf(url: string | undefined): string | undefined {
	if (!url) return undefined;
	try {
		const { origin } = new URL(url);
		return origin === "null" ? undefined : origin;
	} catch {
		return undefined;
	}
}

function isWebUrl(url: string): boolean {
	return /^(https?|wss?):/i.test(url);
}

function substitute(substitution: string, match: RegExpExecArray): string {
	return substitution.replace(/\\(\\|[0-9])/g, (_all, ref: string) =>
		ref === "\\" ? "\\" : (match[Number(ref)] ?? ""),
	);
}

function matchedRule(extensionId: string, rule: CompiledRule): MatchedRule {
	return { extensionId, rulesetId: rule.rulesetId, ruleId: rule.rule.id };
}

/**
 * Chrome's declarativeNetRequest evaluation for every extension in one
 * session. Within an extension the highest priority rule acts, and on a tie
 * allow > allowAllRequests > block > upgradeScheme > redirect. Across
 * extensions a block wins, then the most recently added extension's redirect.
 */
export class DnrEngine {
	private readonly extensions = new Map<string, EngineExtension>();
	private readonly frameCaches = new Map<
		string,
		Map<string, CompiledRule | null>
	>();

	setExtension(rules: EngineExtension): void {
		this.extensions.delete(rules.extensionId);
		this.extensions.set(rules.extensionId, rules);
		this.frameCaches.delete(rules.extensionId);
	}

	removeExtension(extensionId: string): void {
		this.extensions.delete(extensionId);
		this.frameCaches.delete(extensionId);
	}

	get isEmpty(): boolean {
		for (const extension of this.extensions.values()) {
			if (extension.rulesets.some((ruleset) => ruleset.size > 0)) return false;
		}
		return true;
	}

	get hasModifyHeaders(): boolean {
		for (const extension of this.extensions.values()) {
			if (extension.rulesets.some((ruleset) => ruleset.hasModifyHeaders)) {
				return true;
			}
		}
		return false;
	}

	evaluate(request: DnrRequest): DnrDecision {
		const none: DnrDecision = {
			outcome: { kind: "none" },
			requestHeaders: [],
			responseHeaders: [],
			matched: [],
		};
		if (this.extensions.size === 0 || !isWebUrl(request.url)) return none;
		const prepared = prepareRequest(request);
		if (!prepared) return none;

		const results: [EngineExtension, ExtensionResult][] = [];
		for (const extension of [...this.extensions.values()].reverse()) {
			results.push([extension, this.evaluateExtension(extension, prepared)]);
		}

		let outcome: DnrOutcome = { kind: "none" };
		const matched: MatchedRule[] = [];
		for (const [extension, { action, redirectUrl }] of results) {
			if (!action) continue;
			const rule = matchedRule(extension.extensionId, action);
			matched.push(rule);
			const type = action.rule.action.type;
			if (type === "block") {
				if (outcome.kind !== "block")
					outcome = { kind: "block", matched: rule };
			} else if (redirectUrl) {
				if (outcome.kind === "none" || outcome.kind === "allow") {
					outcome = { kind: "redirect", url: redirectUrl, matched: rule };
				}
			} else if (type === "allow" || type === "allowAllRequests") {
				if (outcome.kind === "none") outcome = { kind: "allow", matched: rule };
			}
		}
		if (outcome.kind === "block" || outcome.kind === "redirect") {
			return { ...none, outcome, matched };
		}

		const requestHeaders: HeaderChange[] = [];
		const responseHeaders: HeaderChange[] = [];
		const requestState = new Map<string, HeaderInfo["operation"]>();
		const responseState = new Map<string, HeaderInfo["operation"]>();
		const take = (
			extensionId: string,
			infos: HeaderInfo[] | undefined,
			state: Map<string, HeaderInfo["operation"]>,
			into: HeaderChange[],
		) => {
			let took = false;
			for (const info of infos ?? []) {
				const name = info.header.toLowerCase();
				const previous = state.get(name);
				if (
					previous &&
					!(previous === "append" && info.operation === "append")
				) {
					continue;
				}
				state.set(name, info.operation);
				into.push({ ...info, extensionId });
				took = true;
			}
			return took;
		};
		for (const [extension, { headerRules }] of results) {
			for (const rule of headerRules) {
				const { requestHeaders: req, responseHeaders: res } = rule.rule.action;
				const tookRequest = take(
					extension.extensionId,
					req,
					requestState,
					requestHeaders,
				);
				const tookResponse = take(
					extension.extensionId,
					res,
					responseState,
					responseHeaders,
				);
				if (tookRequest || tookResponse) {
					matched.push(matchedRule(extension.extensionId, rule));
				}
			}
		}
		return { outcome, requestHeaders, responseHeaders, matched };
	}

	private evaluateExtension(
		extension: EngineExtension,
		request: PreparedRequest,
		withFrames = true,
	): ExtensionResult {
		const frameAllow =
			withFrames && extension.rulesets.some((set) => set.hasAllowAllRequests)
				? this.frameAllowRule(extension, request)
				: null;
		let best: CompiledRule | null = frameAllow;
		let allowPriority = frameAllow?.priority ?? Number.NEGATIVE_INFINITY;
		const headerRules: CompiledRule[] = [];
		const stamp = newLookupStamp();
		const requestAccess = () =>
			extension.hasHostAccess(request.request.url) &&
			(!request.request.initiator ||
				extension.hasHostAccess(request.request.initiator));
		let access: boolean | undefined;
		const hasAccess = () => {
			access ??= requestAccess();
			return access;
		};

		for (const ruleset of extension.rulesets) {
			ruleset.forEachMatch(request, stamp, (rule) => {
				const type = rule.rule.action.type;
				if (type === "modifyHeaders") {
					if (hasAccess()) headerRules.push(rule);
					return;
				}
				if (type === "allow" || type === "allowAllRequests") {
					allowPriority = Math.max(allowPriority, rule.priority);
				}
				const needsAccess =
					type === "redirect" || extension.hostAccessForAllActions;
				if (needsAccess && !hasAccess()) return;
				if (
					type === "upgradeScheme" &&
					!UPGRADEABLE.has(request.url.protocol)
				) {
					return;
				}
				if (outranks(rule, best)) best = rule;
			});
		}

		const action: CompiledRule | null = best;
		const redirectUrl = action
			? this.redirectUrl(extension, action, request)
			: null;
		if (
			action &&
			(action.rule.action.type === "redirect" ||
				action.rule.action.type === "upgradeScheme") &&
			!redirectUrl
		) {
			return { ...NO_RESULT, headerRules: [] };
		}
		const winner = action?.rule.action.type;
		const headersApply = winner !== "block" && !redirectUrl;
		return {
			action,
			redirectUrl,
			headerRules: headersApply
				? headerRules
						.filter((rule) => rule.priority > allowPriority)
						.sort((a, b) => b.priority - a.priority)
				: [],
		};
	}

	private redirectUrl(
		extension: EngineExtension,
		rule: CompiledRule,
		request: PreparedRequest,
	): string | null {
		const url = request.request.url;
		let target: string | null = null;
		if (rule.rule.action.type === "upgradeScheme") {
			target = url.replace(/^http:/i, "https:").replace(/^ws:/i, "wss:");
		} else if (rule.rule.action.type === "redirect") {
			target = this.redirectTarget(
				extension,
				rule,
				rule.rule.action.redirect,
				url,
			);
		}
		return target && target !== url ? target : null;
	}

	private redirectTarget(
		extension: EngineExtension,
		rule: CompiledRule,
		redirect: Redirect | undefined,
		url: string,
	): string | null {
		if (!redirect) return null;
		if (redirect.extensionPath) {
			return extension.resolveExtensionPath(redirect.extensionPath);
		}
		if (redirect.url) return redirect.url;
		if (redirect.regexSubstitution !== undefined) {
			const match = regexMatch(rule, url);
			return match ? substitute(redirect.regexSubstitution, match) : null;
		}
		if (redirect.transform) return applyUrlTransform(url, redirect.transform);
		return null;
	}

	/**
	 * The allowAllRequests rule that won the navigation of a frame the request
	 * runs in, if any. Chrome records it at navigation; this re-derives it from
	 * the frame's committed URL so no per-frame state has to be kept.
	 */
	private frameAllowRule(
		extension: EngineExtension,
		request: PreparedRequest,
	): CompiledRule | null {
		const frameUrls = request.request.frameUrls ?? [];
		let cache = this.frameCaches.get(extension.extensionId);
		if (!cache) {
			cache = new Map();
			this.frameCaches.set(extension.extensionId, cache);
		}
		let best: CompiledRule | null = null;
		for (let index = 0; index < frameUrls.length; index++) {
			const url = frameUrls[index] as string;
			if (!isWebUrl(url)) continue;
			const parent = frameUrls[index + 1];
			const resourceType =
				index === frameUrls.length - 1 ? "main_frame" : "sub_frame";
			const initiator = originOf(parent);
			const key = `${request.request.tabId}\n${resourceType}\n${initiator ?? ""}\n${url}`;
			let rule = cache.get(key);
			if (rule === undefined) {
				const frame = prepareRequest({
					url,
					method: "get",
					resourceType,
					initiator,
					tabId: request.request.tabId,
				});
				const action = frame
					? this.evaluateExtension(extension, frame, false).action
					: null;
				rule = action?.rule.action.type === "allowAllRequests" ? action : null;
				if (cache.size >= FRAME_CACHE_LIMIT) cache.clear();
				cache.set(key, rule);
			}
			if (rule && (!best || rule.priority > best.priority)) best = rule;
		}
		return best;
	}
}
