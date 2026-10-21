import { describe, expect, test } from "bun:test";
import { parseGitLabRemote } from "./gitlab-remote";

describe("parseGitLabRemote", () => {
	test.each([
		["git@gitlab.com:group/sub/app.git", "gitlab.com/group/sub"],
		[
			"ssh://git@gitlab-ssh.example.com:2222/team/app.git",
			"gitlab-ssh.example.com/team",
		],
		[
			"https://gitlab.example.com:8443/team/app/",
			"gitlab.example.com:8443/team",
		],
	])("parses %s", (remote, owner) => {
		expect(parseGitLabRemote(remote)).toEqual({
			provider: "gitlab",
			owner,
			name: "app",
			url: `https://${owner}/app`,
		});
	});

	test("ignores hosts not named like GitLab", () => {
		expect(parseGitLabRemote("git@github.com:team/app.git")).toBeNull();
		expect(parseGitLabRemote("git@git.example.com:team/app.git")).toBeNull();
	});
});
