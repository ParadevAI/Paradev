import {
	ACTION_TYPES,
	REQUEST_METHODS,
	RESOURCE_TYPES,
	type Rule,
} from "./types";

const FRAME_TYPES = new Set(["main_frame", "sub_frame"]);
const HEADER_OPERATIONS = new Set(["append", "set", "remove"]);
const DOMAIN_TYPES = new Set(["firstParty", "thirdParty"]);
const TRANSFORM_SCHEMES = new Set(["http", "https", "ftp", "chrome-extension"]);
const TRANSFORM_STRING_FIELDS = [
	"scheme",
	"host",
	"port",
	"path",
	"query",
	"fragment",
	"username",
	"password",
] as const;
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const BAD_HEADER_VALUE = /[\0\r\n]/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Chrome refuses non-ASCII filters.
const ASCII = /^[\x00-\x7f]*$/;

export interface ValidateOptions {
	/** Only session rules may name tabs. */
	session?: boolean;
}

function fail(rule: { id?: unknown }, problem: string): never {
	throw new Error(`Rule with id ${String(rule.id)} ${problem}`);
}

function checkList(
	rule: Rule,
	key: string,
	values: unknown,
	allowed?: readonly string[],
) {
	if (values === undefined) return;
	if (
		!Array.isArray(values) ||
		values.some((value) => typeof value !== "string")
	) {
		fail(rule, `has an invalid "condition.${key}" value.`);
	}
	if (allowed && values.some((value) => !allowed.includes(value))) {
		fail(rule, `has an invalid "condition.${key}" value.`);
	}
}

/**
 * Why Chrome's RE2 matcher would refuse `regex`, or null. RE2 has no
 * lookaround or backreferences and Chrome only takes ASCII patterns.
 */
export function regexFilterProblem(regex: unknown): "syntaxError" | null {
	if (typeof regex !== "string" || !ASCII.test(regex)) return "syntaxError";
	try {
		new RegExp(regex);
	} catch {
		return "syntaxError";
	}
	let inClass = false;
	for (let index = 0; index < regex.length; index++) {
		const char = regex[index];
		if (char === "\\") {
			const next = regex[index + 1] ?? "";
			// Backreferences, and \C, which RE2 reads as any byte and JS as "C".
			if (/[1-9kC]/.test(next)) return "syntaxError";
			index++;
		} else if (inClass) {
			if (char === "]") inClass = false;
		} else if (char === "[") {
			inClass = true;
		} else if (char === "(" && /^\?<?[=!]/.test(regex.slice(index + 1))) {
			return "syntaxError";
		}
	}
	return null;
}

function isValidQueryTransform(value: unknown): boolean {
	if (value === undefined) return true;
	if (typeof value !== "object" || value === null) return false;
	const { removeParams, addOrReplaceParams } = value as Record<string, unknown>;
	const strings = (list: unknown) =>
		Array.isArray(list) && list.every((item) => typeof item === "string");
	return (
		(removeParams === undefined || strings(removeParams)) &&
		(addOrReplaceParams === undefined ||
			(Array.isArray(addOrReplaceParams) &&
				addOrReplaceParams.every(
					(param) =>
						typeof param?.key === "string" && typeof param.value === "string",
				)))
	);
}

function isValidRedirectUrl(raw: string): boolean {
	try {
		return new URL(raw).protocol !== "javascript:";
	} catch {
		return false;
	}
}

/** Throws Chrome's style of message for a rule Chrome would refuse. */
export function validateRule(rule: Rule, options: ValidateOptions = {}): void {
	if (typeof rule !== "object" || rule === null) {
		throw new Error("A rule must be an object.");
	}
	if (!Number.isInteger(rule.id) || rule.id < 1) {
		fail(rule, 'does not have a valid "id".');
	}
	if (
		rule.priority !== undefined &&
		(!Number.isInteger(rule.priority) || rule.priority < 1)
	) {
		fail(rule, 'has an invalid "priority".');
	}
	const action = rule.action;
	if (!action || !ACTION_TYPES.includes(action.type)) {
		fail(rule, 'does not specify a valid "action.type".');
	}
	const condition = rule.condition;
	if (typeof condition !== "object" || condition === null) {
		fail(rule, 'does not specify the "condition" key.');
	}
	if (action.type === "redirect") {
		const redirect = action.redirect;
		if (
			!redirect ||
			(!redirect.extensionPath &&
				!redirect.url &&
				!redirect.transform &&
				redirect.regexSubstitution === undefined)
		) {
			fail(rule, 'does not specify a valid "action.redirect".');
		}
		if (redirect.extensionPath && !redirect.extensionPath.startsWith("/")) {
			fail(rule, 'has an "extensionPath" that does not start with "/".');
		}
		if (
			redirect.url !== undefined &&
			(typeof redirect.url !== "string" || !isValidRedirectUrl(redirect.url))
		) {
			fail(rule, 'does not provide a valid URL for "action.redirect.url".');
		}
		const transform = redirect.transform;
		if (
			transform !== undefined &&
			(typeof transform !== "object" ||
				transform === null ||
				Array.isArray(transform) ||
				TRANSFORM_STRING_FIELDS.some(
					(key) =>
						transform[key] !== undefined && typeof transform[key] !== "string",
				) ||
				!isValidQueryTransform(transform.queryTransform))
		) {
			fail(rule, 'has an invalid "action.redirect.transform".');
		}
		if (
			transform?.scheme !== undefined &&
			!TRANSFORM_SCHEMES.has(transform.scheme)
		) {
			fail(rule, 'has an invalid "action.redirect.transform.scheme".');
		}
		if (
			transform?.port !== undefined &&
			!(
				typeof transform.port === "string" &&
				/^\d{0,5}$/.test(transform.port) &&
				Number(transform.port) <= 65_535
			)
		) {
			fail(rule, 'has an invalid "action.redirect.transform.port".');
		}
		if (redirect.regexSubstitution !== undefined && !condition.regexFilter) {
			fail(rule, 'uses "regexSubstitution" without a "regexFilter".');
		}
	}
	if (action.type === "modifyHeaders") {
		for (const list of [action.requestHeaders, action.responseHeaders]) {
			if (list !== undefined && !Array.isArray(list)) {
				fail(rule, "has an invalid header modification.");
			}
		}
		const headers = [
			...(action.requestHeaders ?? []),
			...(action.responseHeaders ?? []),
		];
		if (headers.length === 0) {
			fail(rule, "does not modify any headers.");
		}
		for (const info of headers) {
			if (
				typeof info?.header !== "string" ||
				!HEADER_NAME.test(info.header) ||
				!HEADER_OPERATIONS.has(info.operation) ||
				(info.operation !== "remove" &&
					(typeof info.value !== "string" || BAD_HEADER_VALUE.test(info.value)))
			) {
				fail(rule, "has an invalid header modification.");
			}
		}
	}
	if (
		condition.urlFilter !== undefined &&
		condition.regexFilter !== undefined
	) {
		fail(rule, 'specifies both "urlFilter" and "regexFilter".');
	}
	if (condition.urlFilter !== undefined) {
		if (
			typeof condition.urlFilter !== "string" ||
			condition.urlFilter === "" ||
			!ASCII.test(condition.urlFilter)
		) {
			fail(rule, 'has an invalid "condition.urlFilter".');
		}
	}
	if (
		condition.regexFilter !== undefined &&
		regexFilterProblem(condition.regexFilter)
	) {
		fail(rule, "specified an incorrect regular expression.");
	}
	if (condition.resourceTypes && condition.excludedResourceTypes) {
		fail(rule, 'specifies both "resourceTypes" and "excludedResourceTypes".');
	}
	checkList(rule, "resourceTypes", condition.resourceTypes, RESOURCE_TYPES);
	checkList(
		rule,
		"excludedResourceTypes",
		condition.excludedResourceTypes,
		RESOURCE_TYPES,
	);
	checkList(rule, "requestMethods", condition.requestMethods, REQUEST_METHODS);
	checkList(
		rule,
		"excludedRequestMethods",
		condition.excludedRequestMethods,
		REQUEST_METHODS,
	);
	for (const key of [
		"requestDomains",
		"excludedRequestDomains",
		"initiatorDomains",
		"excludedInitiatorDomains",
		"domains",
		"excludedDomains",
	] as const) {
		checkList(rule, key, condition[key]);
	}
	if (
		condition.domainType !== undefined &&
		!DOMAIN_TYPES.has(condition.domainType)
	) {
		fail(rule, 'has an invalid "condition.domainType".');
	}
	for (const key of ["tabIds", "excludedTabIds"] as const) {
		const ids = condition[key];
		if (ids === undefined) continue;
		if (!options.session) {
			fail(rule, `cannot specify "condition.${key}" outside session rules.`);
		}
		if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id))) {
			fail(rule, `has an invalid "condition.${key}" value.`);
		}
	}
	if (condition.tabIds?.length === 0) {
		fail(rule, 'has an empty "condition.tabIds" list.');
	}
	if (condition.requestDomains?.length === 0) {
		fail(rule, 'has an empty "condition.requestDomains" list.');
	}
	if (condition.initiatorDomains?.length === 0) {
		fail(rule, 'has an empty "condition.initiatorDomains" list.');
	}
	if (
		action.type === "allowAllRequests" &&
		(!condition.resourceTypes?.length ||
			condition.resourceTypes.some((type) => !FRAME_TYPES.has(type)))
	) {
		fail(
			rule,
			'is an "allowAllRequests" rule whose "resourceTypes" are not only frames.',
		);
	}
}

export function isRegexRule(rule: Rule): boolean {
	return rule.condition?.regexFilter !== undefined;
}
