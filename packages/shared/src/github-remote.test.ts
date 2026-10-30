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
});
