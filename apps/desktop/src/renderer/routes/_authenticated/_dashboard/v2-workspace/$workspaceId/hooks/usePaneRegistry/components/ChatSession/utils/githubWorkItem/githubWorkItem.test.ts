import { expect, test } from "bun:test";
import { parseGithubWorkItemUrl } from "./githubWorkItem";

test("reads a pull request or issue, with a subpage or a fragment", () => {
	expect(
		parseGithubWorkItemUrl("https://github.com/superset-sh/superset/pull/8329"),
	).toEqual({
		kind: "pr",
		owner: "superset-sh",
		repo: "superset",
		number: 8329,
	});
	expect(
		parseGithubWorkItemUrl(
			"https://www.github.com/acme/widgets/issues/42#issuecomment-1",
		),
	).toEqual({ kind: "issue", owner: "acme", repo: "widgets", number: 42 });
	expect(
		parseGithubWorkItemUrl(
			"https://github.com/acme/widgets/pull/73/files?diff=split",
		),
	).toMatchObject({ kind: "pr", number: 73 });
});

test("rejects a number too large to be a pull request", () => {
	expect(
		parseGithubWorkItemUrl(
			"https://github.com/superset-sh/superset/pull/99999999999999999999",
		),
	).toBeNull();
});

test("leaves other GitHub pages and other sites alone", () => {
	for (const href of [
		"https://github.com/acme/widgets/actions",
		"https://github.com/acme/widgets/issues/0",
		"https://github.com/acme/widgets/pull/12/commits/abc/def",
		"https://github.com.evil.io/acme/widgets/pull/1",
		"https://gitlab.com/acme/widgets/merge_requests/1",
		"not a url",
	]) {
		expect(parseGithubWorkItemUrl(href)).toBeNull();
	}
});
