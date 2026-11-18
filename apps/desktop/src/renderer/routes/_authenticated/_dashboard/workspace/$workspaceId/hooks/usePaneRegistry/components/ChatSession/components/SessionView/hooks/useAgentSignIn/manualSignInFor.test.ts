import { describe, expect, test } from "bun:test";
import { manualSignInFor } from "./manualSignInFor";

const manualClaude = [{ agent: "claude", provider: "manual" }];

describe("manualSignInFor", () => {
	test("the creator's own box with Claude on Manual", () => {
		expect(
			manualSignInFor({
				presetId: "claude",
				creatorUserId: "u1",
				userId: "u1",
				credentials: manualClaude,
			}),
		).toBe(true);
	});

	test("a stored sign-in, another agent, someone else's box or a local workspace are not Manual", () => {
		const base = {
			presetId: "claude",
			creatorUserId: "u1" as string | undefined,
			userId: "u1",
		};
		expect(
			manualSignInFor({
				...base,
				credentials: [{ agent: "claude", provider: null }],
			}),
		).toBe(false);
		expect(
			manualSignInFor({
				...base,
				presetId: "codex",
				credentials: manualClaude,
			}),
		).toBe(false);
		expect(
			manualSignInFor({ ...base, userId: "u2", credentials: manualClaude }),
		).toBe(false);
		expect(
			manualSignInFor({
				...base,
				creatorUserId: undefined,
				credentials: manualClaude,
			}),
		).toBe(false);
	});
});
