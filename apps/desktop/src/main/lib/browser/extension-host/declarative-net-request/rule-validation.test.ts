import { describe, expect, test } from "bun:test";
import { regexFilterProblem, validateRule } from "./rule-validation";
import type { Rule } from "./types";

function rule(overrides: Record<string, unknown> = {}): Rule {
	return {
		id: 1,
		action: { type: "block" },
		condition: { urlFilter: "||ads.example" },
		...overrides,
	} as Rule;
}

function withCondition(condition: Record<string, unknown>): Rule {
	return rule({ condition });
}

function redirect(redirect: Record<string, unknown>, condition = {}): Rule {
	return rule({ action: { type: "redirect", redirect }, condition });
}

function headers(action: Record<string, unknown>): Rule {
	return rule({ action: { type: "modifyHeaders", ...action } });
}

test("a well-formed rule passes", () => {
	expect(() => validateRule(rule())).not.toThrow();
	expect(() =>
		validateRule(
			headers({
				requestHeaders: [{ header: "X-Test", operation: "set", value: "1" }],
			}),
		),
	).not.toThrow();
});

describe("rejects", () => {
	const cases: [string, unknown, string][] = [
		["a non-object", null, "A rule must be an object."],
		["a bad id", rule({ id: 0 }), 'does not have a valid "id"'],
		["a bad priority", rule({ priority: 1.5 }), 'invalid "priority"'],
		[
			"an unknown action",
			rule({ action: { type: "nope" } }),
			'valid "action.type"',
		],
		["a missing condition", rule({ condition: null }), '"condition" key'],
		["an empty redirect", redirect({}), 'valid "action.redirect"'],
		[
			"a relative extensionPath",
			redirect({ extensionPath: "a.js" }),
			"does not start with",
		],
		[
			"regexSubstitution without regexFilter",
			redirect({ regexSubstitution: "x" }),
			'without a "regexFilter"',
		],
		[
			"a javascript: redirect URL",
			redirect({ url: "javascript:alert(1)" }),
			'"action.redirect.url"',
		],
		[
			"a redirect URL that does not parse",
			redirect({ url: "not a url" }),
			'"action.redirect.url"',
		],
		[
			"a transform scheme Chrome does not allow",
			redirect({ transform: { scheme: "javascript" } }),
			'"action.redirect.transform.scheme"',
		],
		[
			"a transform that is not an object",
			redirect({ transform: "bad" }),
			'"action.redirect.transform"',
		],
		[
			"a transform host that is not a string",
			redirect({ transform: { host: 5 } }),
			'"action.redirect.transform"',
		],
		[
			"a malformed queryTransform",
			redirect({ transform: { queryTransform: { removeParams: "utm" } } }),
			'"action.redirect.transform"',
		],
		[
			"a transform port that is not a port",
			redirect({ transform: { port: "80abc" } }),
			'"action.redirect.transform.port"',
		],
		["no header changes", headers({}), "does not modify any headers"],
		[
			"a non-array header list",
			headers({ requestHeaders: { header: "x", operation: "remove" } }),
			"invalid header modification",
		],
		[
			"a header name that is not a token",
			headers({
				requestHeaders: [{ header: "x\r\ny", operation: "remove" }],
			}),
			"invalid header modification",
		],
		[
			"a header value with a line break",
			headers({
				requestHeaders: [{ header: "x", operation: "set", value: "a\nb" }],
			}),
			"invalid header modification",
		],
		[
			"an unknown header operation",
			headers({ requestHeaders: [{ header: "x", operation: "drop" }] }),
			"invalid header modification",
		],
		[
			"both urlFilter and regexFilter",
			withCondition({ urlFilter: "a", regexFilter: "a" }),
			'both "urlFilter" and "regexFilter"',
		],
		[
			"a non-ASCII urlFilter",
			withCondition({ urlFilter: "ads.exämple" }),
			'"condition.urlFilter"',
		],
		[
			"a null regexFilter",
			withCondition({ regexFilter: null }),
			"incorrect regular expression",
		],
		[
			"a numeric regexFilter",
			withCondition({ regexFilter: 0 }),
			"incorrect regular expression",
		],
		[
			"a regexFilter with a lookahead",
			withCondition({ regexFilter: "ads(?=\\.js)" }),
			"incorrect regular expression",
		],
		[
			"both resourceTypes and excludedResourceTypes",
			withCondition({ resourceTypes: ["script"], excludedResourceTypes: [] }),
			"both",
		],
		[
			"an unknown resource type",
			withCondition({ resourceTypes: ["nope"] }),
			'"condition.resourceTypes"',
		],
		[
			"an unknown request method",
			withCondition({ requestMethods: ["fetch"] }),
			'"condition.requestMethods"',
		],
		[
			"a non-string domain",
			withCondition({ requestDomains: [1] }),
			'"condition.requestDomains"',
		],
		[
			"an empty requestDomains list",
			withCondition({ requestDomains: [] }),
			"empty",
		],
		[
			"an empty initiatorDomains list",
			withCondition({ initiatorDomains: [] }),
			"empty",
		],
		[
			"an unknown domainType",
			withCondition({ domainType: "forthParty" }),
			'"condition.domainType"',
		],
		[
			"tabIds outside session rules",
			withCondition({ tabIds: [1] }),
			"outside session rules",
		],
		[
			"allowAllRequests on subresources",
			rule({
				action: { type: "allowAllRequests" },
				condition: { resourceTypes: ["script"] },
			}),
			"not only frames",
		],
	];
	for (const [name, value, message] of cases) {
		test(name, () => {
			expect(() => validateRule(value as Rule)).toThrow(message);
		});
	}
});

test("only session rules may name tabs, as a non-empty list of integers", () => {
	const session = { session: true };
	expect(() =>
		validateRule(withCondition({ tabIds: [3], excludedTabIds: [4] }), session),
	).not.toThrow();
	expect(() => validateRule(withCondition({ tabIds: [] }), session)).toThrow(
		'empty "condition.tabIds"',
	);
	expect(() => validateRule(withCondition({ tabIds: 3 }), session)).toThrow(
		'invalid "condition.tabIds"',
	);
	expect(() =>
		validateRule(withCondition({ excludedTabIds: ["3"] }), session),
	).toThrow('invalid "condition.excludedTabIds"');
});

test("regexFilterProblem accepts RE2's subset only", () => {
	expect(regexFilterProblem("^https://[a-z]+\\.example/(ads|track)\\?")).toBe(
		null,
	);
	expect(regexFilterProblem("[(?=]x")).toBe(null);
	expect(regexFilterProblem("\\(?=x")).toBe(null);
	for (const unsupported of [
		undefined,
		"(",
		"a(?!b)",
		"(?<=a)b",
		"(?<!a)b",
		"(a)\\1",
		"a\\Cb",
		"(?<n>a)\\k<n>",
		"exämple",
	]) {
		expect(regexFilterProblem(unsupported)).toBe("syntaxError");
	}
});
