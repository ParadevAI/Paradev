export const RESOURCE_TYPES = [
	"main_frame",
	"sub_frame",
	"stylesheet",
	"script",
	"image",
	"font",
	"object",
	"xmlhttprequest",
	"ping",
	"csp_report",
	"media",
	"websocket",
	"webtransport",
	"webbundle",
	"other",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const REQUEST_METHODS = [
	"connect",
	"delete",
	"get",
	"head",
	"options",
	"patch",
	"post",
	"put",
	"other",
] as const;
export type RequestMethod = (typeof REQUEST_METHODS)[number];

export const ACTION_TYPES = [
	"block",
	"redirect",
	"allow",
	"upgradeScheme",
	"modifyHeaders",
	"allowAllRequests",
] as const;
export type RuleActionType = (typeof ACTION_TYPES)[number];

export type HeaderOperation = "append" | "set" | "remove";

export interface HeaderInfo {
	header: string;
	operation: HeaderOperation;
	value?: string;
}

export interface QueryKeyValue {
	key: string;
	value: string;
	replaceOnly?: boolean;
}

export interface UrlTransform {
	scheme?: string;
	host?: string;
	port?: string;
	path?: string;
	query?: string;
	queryTransform?: {
		removeParams?: string[];
		addOrReplaceParams?: QueryKeyValue[];
	};
	fragment?: string;
	username?: string;
	password?: string;
}

export interface Redirect {
	extensionPath?: string;
	url?: string;
	transform?: UrlTransform;
	regexSubstitution?: string;
}

export interface RuleAction {
	type: RuleActionType;
	redirect?: Redirect;
	requestHeaders?: HeaderInfo[];
	responseHeaders?: HeaderInfo[];
}

export interface RuleCondition {
	urlFilter?: string;
	regexFilter?: string;
	isUrlFilterCaseSensitive?: boolean;
	initiatorDomains?: string[];
	excludedInitiatorDomains?: string[];
	requestDomains?: string[];
	excludedRequestDomains?: string[];
	resourceTypes?: ResourceType[];
	excludedResourceTypes?: ResourceType[];
	requestMethods?: RequestMethod[];
	excludedRequestMethods?: RequestMethod[];
	domainType?: "firstParty" | "thirdParty";
	tabIds?: number[];
	excludedTabIds?: number[];
	/** Pre-Chrome 101 names, still accepted in static rulesets. */
	domains?: string[];
	excludedDomains?: string[];
}

export interface Rule {
	id: number;
	priority?: number;
	action: RuleAction;
	condition: RuleCondition;
}

export interface RulesetSource {
	id: string;
	enabled: boolean;
	path: string;
}

/** A request as the rules see it. */
export interface DnrRequest {
	url: string;
	method: string;
	resourceType: ResourceType;
	/** Origin of the document that issued the request, if any. */
	initiator?: string;
	tabId: number;
	/**
	 * Committed URLs of the frames the request runs in, nearest first. For a
	 * frame navigation it starts at the navigating frame's parent.
	 */
	frameUrls?: string[];
}

export interface MatchedRule {
	extensionId: string;
	rulesetId: string;
	ruleId: number;
}

export interface HeaderChange extends HeaderInfo {
	extensionId: string;
}

export type DnrOutcome =
	| { kind: "none" }
	| { kind: "allow"; matched: MatchedRule }
	| { kind: "block"; matched: MatchedRule }
	| { kind: "redirect"; url: string; matched: MatchedRule };

export interface DnrDecision {
	outcome: DnrOutcome;
	requestHeaders: HeaderChange[];
	responseHeaders: HeaderChange[];
	/** The rules whose action was taken: the block or redirect, else every allow. */
	matched: MatchedRule[];
	/** modifyHeaders rules that changed a request or response header. */
	requestHeaderRules: MatchedRule[];
	responseHeaderRules: MatchedRule[];
}

export const DYNAMIC_RULESET_ID = "_dynamic";
export const SESSION_RULESET_ID = "_session";
