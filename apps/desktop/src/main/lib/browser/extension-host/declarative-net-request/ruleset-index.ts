import { type PreparedRequest, resourceTypeBit } from "./prepared-request";
import {
	RESOURCE_TYPES,
	type ResourceType,
	type Rule,
	type RuleActionType,
} from "./types";
import {
	compileUrlFilter,
	urlFilterDomain,
	urlFilterTokens,
} from "./url-filter";

const ALL_TYPES = (1 << RESOURCE_TYPES.length) - 1;
const MAIN_FRAME = resourceTypeBit("main_frame");

/** Higher wins between rules of equal priority, as in Chrome. */
export const ACTION_RANK: Record<RuleActionType, number> = {
	allow: 5,
	allowAllRequests: 4,
	block: 3,
	upgradeScheme: 2,
	redirect: 1,
	modifyHeaders: 0,
};

export interface CompiledRule {
	rule: Rule;
	rulesetId: string;
	/** Session beats dynamic beats static when priority and action tie. */
	rulesetRank: number;
	priority: number;
	actionRank: number;
	resourceMask: number;
	requestDomains: ReadonlySet<string> | null;
	excludedRequestDomains: ReadonlySet<string> | null;
	initiatorDomains: ReadonlySet<string> | null;
	excludedInitiatorDomains: ReadonlySet<string> | null;
	pattern: RegExp | null | undefined;
	stamp: number;
}

function maskOf(types: ResourceType[] | undefined): number {
	let mask = 0;
	for (const type of types ?? []) mask |= resourceTypeBit(type);
	return mask;
}

function domainSet(domains: string[] | undefined): Set<string> | null {
	return domains
		? new Set(domains.map((domain) => domain.toLowerCase()))
		: null;
}

export function compileRule(
	rule: Rule,
	rulesetId: string,
	rulesetRank: number,
): CompiledRule {
	const condition = rule.condition ?? {};
	let resourceMask = ALL_TYPES & ~MAIN_FRAME;
	if (condition.resourceTypes) resourceMask = maskOf(condition.resourceTypes);
	else if (condition.excludedResourceTypes) {
		resourceMask = ALL_TYPES & ~maskOf(condition.excludedResourceTypes);
	}
	return {
		rule,
		rulesetId,
		rulesetRank,
		priority: rule.priority ?? 1,
		actionRank: ACTION_RANK[rule.action.type] ?? 0,
		resourceMask,
		requestDomains: domainSet(condition.requestDomains),
		excludedRequestDomains: domainSet(condition.excludedRequestDomains),
		initiatorDomains: domainSet(
			condition.initiatorDomains ?? condition.domains,
		),
		excludedInitiatorDomains: domainSet(
			condition.excludedInitiatorDomains ?? condition.excludedDomains,
		),
		pattern: undefined,
		stamp: 0,
	};
}

function patternOf(compiled: CompiledRule): RegExp | null {
	if (compiled.pattern !== undefined) return compiled.pattern;
	const { regexFilter, urlFilter, isUrlFilterCaseSensitive } =
		compiled.rule.condition;
	const caseSensitive = isUrlFilterCaseSensitive === true;
	try {
		compiled.pattern = regexFilter
			? new RegExp(regexFilter, caseSensitive ? "" : "i")
			: urlFilter
				? compileUrlFilter(urlFilter, caseSensitive)
				: null;
	} catch {
		compiled.pattern = /(?!)/;
	}
	return compiled.pattern;
}

/** The regexFilter match, for regexSubstitution. */
export function regexMatch(
	compiled: CompiledRule,
	url: string,
): RegExpExecArray | null {
	return patternOf(compiled)?.exec(url) ?? null;
}

function inDomains(suffixes: string[], domains: ReadonlySet<string>): boolean {
	for (const suffix of suffixes) if (domains.has(suffix)) return true;
	return false;
}

export function ruleMatches(
	compiled: CompiledRule,
	request: PreparedRequest,
): boolean {
	if ((compiled.resourceMask & request.resourceBit) === 0) return false;
	const { condition } = compiled.rule;
	if (
		condition.requestMethods &&
		!condition.requestMethods.includes(request.method as never)
	) {
		return false;
	}
	if (condition.excludedRequestMethods?.includes(request.method as never)) {
		return false;
	}
	if (condition.tabIds && !condition.tabIds.includes(request.request.tabId)) {
		return false;
	}
	if (condition.excludedTabIds?.includes(request.request.tabId)) return false;
	if (condition.domainType) {
		const wantThirdParty = condition.domainType === "thirdParty";
		if (request.thirdParty !== wantThirdParty) return false;
	}
	const {
		requestDomains,
		excludedRequestDomains,
		initiatorDomains,
		excludedInitiatorDomains,
	} = compiled;
	if (
		excludedRequestDomains &&
		inDomains(request.hostSuffixes, excludedRequestDomains)
	) {
		return false;
	}
	if (requestDomains && !inDomains(request.hostSuffixes, requestDomains)) {
		return false;
	}
	if (
		excludedInitiatorDomains &&
		inDomains(request.initiatorSuffixes, excludedInitiatorDomains)
	) {
		return false;
	}
	if (
		initiatorDomains &&
		!inDomains(request.initiatorSuffixes, initiatorDomains)
	) {
		return false;
	}
	const pattern = patternOf(compiled);
	return pattern === null || pattern.test(request.request.url);
}

function push<K>(map: Map<K, CompiledRule[]>, key: K, rule: CompiledRule) {
	const list = map.get(key);
	if (list) list.push(rule);
	else map.set(key, [rule]);
}

let nextStamp = 1;

/** A new stamp, so a rule listed under two keys is visited once per lookup. */
export function newLookupStamp(): number {
	nextStamp = nextStamp >= Number.MAX_SAFE_INTEGER ? 1 : nextStamp + 1;
	return nextStamp;
}

/**
 * One ruleset's rules, keyed so a request visits only rules that could match
 * it: by request domain, then by a rare URL token, then by initiator domain.
 */
export class RulesetIndex {
	readonly size: number;
	readonly hasAllowAllRequests: boolean;
	readonly hasModifyHeaders: boolean;
	private readonly byRequestDomain = new Map<string, CompiledRule[]>();
	private readonly byToken = new Map<string, CompiledRule[]>();
	private readonly byInitiatorDomain = new Map<string, CompiledRule[]>();
	private readonly unindexed: CompiledRule[] = [];

	constructor(
		readonly rulesetId: string,
		rules: Rule[],
		rulesetRank: number,
		disabledRuleIds: ReadonlySet<number> = new Set(),
	) {
		const compiled = rules
			.filter((rule) => !disabledRuleIds.has(rule.id))
			.map((rule) => compileRule(rule, rulesetId, rulesetRank));
		this.size = compiled.length;
		this.hasAllowAllRequests = compiled.some(
			(rule) => rule.rule.action.type === "allowAllRequests",
		);
		this.hasModifyHeaders = compiled.some(
			(rule) => rule.rule.action.type === "modifyHeaders",
		);

		const tokensOf = new Map<CompiledRule, string[]>();
		const tokenCounts = new Map<string, number>();
		for (const rule of compiled) {
			const { urlFilter } = rule.rule.condition;
			if (rule.requestDomains || !urlFilter || urlFilterDomain(urlFilter))
				continue;
			const tokens = urlFilterTokens(urlFilter);
			tokensOf.set(rule, tokens);
			for (const token of tokens) {
				tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
			}
		}

		for (const rule of compiled) {
			const { urlFilter } = rule.rule.condition;
			const { requestDomains, initiatorDomains } = rule;
			if (requestDomains?.size) {
				for (const domain of requestDomains) {
					push(this.byRequestDomain, domain, rule);
				}
				continue;
			}
			const pinnedDomain = urlFilter ? urlFilterDomain(urlFilter) : null;
			if (pinnedDomain) {
				push(this.byRequestDomain, pinnedDomain, rule);
				continue;
			}
			const tokens = tokensOf.get(rule);
			if (tokens?.length) {
				let rarest = tokens[0] as string;
				for (const token of tokens) {
					if ((tokenCounts.get(token) ?? 0) < (tokenCounts.get(rarest) ?? 0)) {
						rarest = token;
					}
				}
				push(this.byToken, rarest, rule);
				continue;
			}
			if (initiatorDomains?.size) {
				for (const domain of initiatorDomains) {
					push(this.byInitiatorDomain, domain, rule);
				}
				continue;
			}
			this.unindexed.push(rule);
		}
	}

	/** Calls `visit` once for each rule that matches the request. */
	forEachMatch(
		request: PreparedRequest,
		stamp: number,
		visit: (rule: CompiledRule) => void,
	): void {
		const check = (rule: CompiledRule) => {
			if (rule.stamp === stamp) return;
			rule.stamp = stamp;
			if (ruleMatches(rule, request)) visit(rule);
		};
		for (const suffix of request.hostSuffixes) {
			const rules = this.byRequestDomain.get(suffix);
			if (rules) for (const rule of rules) check(rule);
		}
		if (this.byToken.size > 0) {
			for (const token of request.tokens) {
				const rules = this.byToken.get(token);
				if (rules) for (const rule of rules) check(rule);
			}
		}
		for (const suffix of request.initiatorSuffixes) {
			const rules = this.byInitiatorDomain.get(suffix);
			if (rules) for (const rule of rules) check(rule);
		}
		for (const rule of this.unindexed) check(rule);
	}
}
