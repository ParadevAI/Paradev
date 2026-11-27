import { describe, expect, test } from "bun:test";
import { parseGitHubRemote, parseGitLabRemote, parseGitLabRemoteCandidate, parseRepositoryRemote } from "./github-remote";

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

describe("repository remote parsing", () => {
	test("keeps GitHub parsing unchanged", () => {
		expect(parseGitHubRemote("git@github.com:acme/example.git")).toEqual({
			provider: "github",
			owner: "acme",
			name: "example",
			url: "https://github.com/acme/example",
		});
	});

	test.each([
		"git@gitlab.com:acme/platform/example.git",
		"ssh://git@gitlab.com/acme/platform/example.git",
		"https://gitlab.com/acme/platform/example.git",
	])("parses GitLab subgroup remotes: %s", (remoteUrl) => {
		expect(parseGitLabRemote(remoteUrl)).toEqual({
			provider: "gitlab",
			host: "gitlab.com",
			owner: "acme/platform",
			name: "example",
			url: "https://gitlab.com/acme/platform/example",
		});
	});

	test.each([
		"git@gitlab.example.com:acme/platform/example.git",
		"ssh://git@gitlab.example.com/acme/platform/example.git",
		"https://gitlab.example.com/acme/platform/example.git",
	])("parses self-hosted GitLab candidates: %s", (remoteUrl) => {
		expect(parseGitLabRemoteCandidate(remoteUrl)).toEqual({
			provider: "gitlab",
			host: "gitlab.example.com",
			owner: "acme/platform",
			name: "example",
			url: "https://gitlab.example.com/acme/platform/example",
		});
	});

	test("does not classify an unconfigured host as GitLab", () => {
		expect(
			parseRepositoryRemote("https://bitbucket.org/acme/example.git"),
		).toBe(null);
	});

	test("detects either supported provider", () => {
		expect(
			parseRepositoryRemote("https://gitlab.com/acme/example.git")?.provider,
		).toBe("gitlab");
		expect(
			parseRepositoryRemote("https://github.com/acme/example.git")?.provider,
		).toBe("github");
	});
});
