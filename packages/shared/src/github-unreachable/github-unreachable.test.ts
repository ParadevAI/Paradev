import { describe, expect, test } from "bun:test";
import { isGitHubUnreachableError } from "./github-unreachable";

describe("isGitHubUnreachableError", () => {
	test("matches Node transport codes, including through a cause chain", () => {
		expect(
			isGitHubUnreachableError(
				Object.assign(new Error("x"), { code: "ENOTFOUND" }),
			),
		).toBe(true);
		const wrapped = new Error("request failed", {
			cause: Object.assign(new Error("getaddrinfo EAI_AGAIN api.github.com"), {
				code: "EAI_AGAIN",
			}),
		});
		expect(isGitHubUnreachableError(wrapped)).toBe(true);
	});

	test("matches gh's stderr phrasing and an execFile timeout kill", () => {
		expect(
			isGitHubUnreachableError(
				Object.assign(new Error("Command failed: gh api"), {
					stderr:
						"error connecting to api.github.com\ndial tcp: lookup api.github.com: no such host",
				}),
			),
		).toBe(true);
		expect(
			isGitHubUnreachableError(
				Object.assign(new Error("Command failed"), {
					killed: true,
					signal: "SIGTERM",
				}),
			),
		).toBe(true);
	});

	test("matches what gh 2.98 prints for a dead resolver and a refused proxy", () => {
		expect(
			isGitHubUnreachableError(
				Object.assign(new Error("Command failed: gh api repos/o/r/pulls"), {
					code: 1,
					stderr:
						"error connecting to github.invalid\ncheck your internet connection or https://githubstatus.com\n",
				}),
			),
		).toBe(true);
		expect(
			isGitHubUnreachableError(
				Object.assign(new Error("Command failed"), {
					code: 1,
					stderr:
						'Get "https://api.github.com/repos/o/r/pulls?state=open": proxyconnect tcp: dial tcp 127.0.0.1:1: connect: connection refused',
				}),
			),
		).toBe(true);
	});

	test("does not match answers from GitHub", () => {
		expect(
			isGitHubUnreachableError(
				Object.assign(new Error("Not Found"), { status: 404 }),
			),
		).toBe(false);
		expect(
			isGitHubUnreachableError(
				Object.assign(new Error("gh: HTTP 403: API rate limit exceeded"), {
					code: 1,
					stderr: "gh: API rate limit exceeded",
				}),
			),
		).toBe(false);
		expect(isGitHubUnreachableError("string")).toBe(false);
		expect(isGitHubUnreachableError(null)).toBe(false);
	});
});
