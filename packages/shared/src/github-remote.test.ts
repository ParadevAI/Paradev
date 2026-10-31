import { describe, expect, test } from "bun:test";
import { parseGitHubRemote } from "./github-remote";

describe("parseGitHubRemote", () => {
	test("accepts HTTPS remotes with userinfo and drops it from the URL", () => {
		for (const url of [
			"https://someone@github.com/acme/foo.git",
			"https://someone:ghp_x@github.com/acme/foo",
		]) {
			expect(parseGitHubRemote(url)).toEqual({
				provider: "github",
				owner: "acme",
				name: "foo",
				url: "https://github.com/acme/foo",
			});
		}
	});

	test("rejects HTTPS remotes with a query, fragment, or backslash", () => {
		for (const url of [
			"https://example.com?next=@github.com/acme/foo.git",
			"https://example.com#@github.com/acme/foo",
			"https://example.com\\@github.com/acme/foo",
			"https://github.com/acme?next/foo",
			"https://github.com/acme/foo#bar",
		]) {
			expect(parseGitHubRemote(url)).toBeNull();
		}
	});
});
