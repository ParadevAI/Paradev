import {
	ACTION_TYPES,
	REQUEST_METHODS,
	RESOURCE_TYPES,
	type Rule,
} from "./types";

const FRAME_TYPES = new Set(["main_frame", "sub_frame"]);
const HEADER_OPERATIONS = new Set(["append", "set", "remove"]);

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

/** Throws Chrome's style of message for a rule Chrome would refuse. */
export function validateRule(rule: Rule): void {
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
		if (redirect.regexSubstitution !== undefined && !condition.regexFilter) {
			fail(rule, 'uses "regexSubstitution" without a "regexFilter".');
		}
	}
	if (action.type === "modifyHeaders") {
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
				info.header === "" ||
				!HEADER_OPERATIONS.has(info.operation) ||
				(info.operation !== "remove" && typeof info.value !== "string")
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
			// biome-ignore lint/suspicious/noControlCharactersInRegex: Chrome refuses non-ASCII urlFilters.
			!/^[\x00-\x7f]*$/.test(condition.urlFilter)
		) {
			fail(rule, 'has an invalid "condition.urlFilter".');
		}
	}
	if (condition.regexFilter !== undefined) {
		try {
			new RegExp(condition.regexFilter);
		} catch {
			fail(rule, "specified an incorrect regular expression.");
		}
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
