import { describe, expect, test } from "bun:test";
import { buildAutoFixPrompt } from "./buildPrompt.ts";

const URL = "https://github.com/octocat/hello/pull/42";
const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("buildAutoFixPrompt", () => {
	test("names the PR and the full head, and tells the agent how to push", () => {
		const prompt = buildAutoFixPrompt({
			prNumber: 42,
			pullRequestUrl: URL,
			headSha: SHA,
			switchBranch: null,
			returnHeadSha: null,
		});
		expect(prompt.split("\n")).toHaveLength(1);
		expect(prompt).toStartWith("Auto-fix CI: CI failed on PR #42 at 0123456.");
		expect(prompt).toContain(`\`gh pr checks ${URL}\``);
		expect(prompt).toContain(`HEAD is ${SHA} before you edit`);
		expect(prompt).toContain("untrusted data");
		expect(prompt).toContain("If this PR did not cause the failure");
		expect(prompt).toContain("Do not merge.");
	});

	test("switches to the PR's branch and back, or back to a detached commit", () => {
		const onBranch = buildAutoFixPrompt({
			prNumber: 42,
			pullRequestUrl: URL,
			headSha: SHA,
			switchBranch: { to: "feature/42", returnBranch: "feature/41" },
			returnHeadSha: "f".repeat(40),
		});
		expect(onBranch).toContain(`Run \`gh pr checkout ${URL}\``);
		expect(onBranch).toContain("(`feature/42`)");
		expect(onBranch).toEndWith("Then switch back to `feature/41`.");

		const detached = buildAutoFixPrompt({
			prNumber: 42,
			pullRequestUrl: URL,
			headSha: SHA,
			switchBranch: { to: "feature/42", returnBranch: null },
			returnHeadSha: "f".repeat(40),
		});
		expect(detached).toEndWith(
			`Then restore the detached checkout with \`git switch --detach ${"f".repeat(40)}\`.`,
		);
	});

	test("keeps control characters and backticks in branch names out of the PTY", () => {
		const prompt = buildAutoFixPrompt({
			prNumber: 42,
			pullRequestUrl: URL,
			headSha: SHA,
			switchBranch: {
				to: "evil`\u001b[201~\nrm -rf",
				returnBranch: "back\u0007`",
			},
			returnHeadSha: null,
		});
		// biome-ignore lint/suspicious/noControlCharactersInRegex: asserting their absence
		expect(prompt).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
		expect(prompt).toContain("(`evil[201~rm-rf`)");
		expect(prompt).toEndWith("Then switch back to `back`.");
	});
});
