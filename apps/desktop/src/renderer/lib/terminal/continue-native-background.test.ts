import { expect, test } from "bun:test";
import { continueNativeBackground } from "./continue-native-background";

const input = {
	workspaceId: "workspace",
	terminalId: "old",
	expectedRevision: "captured-source",
};
test("Continue prefers the existing background view and never requests another account", async () => {
	let reads = 0;
	let resumes = 0;
	const result = await continueNativeBackground(input, {
		reconnect: async () => ({
			reconnected: true,
			terminalId: "view",
			label: "Claude",
		}),
		source: async () => {
			reads++;
			return null;
		},
		resume: async () => {
			resumes++;
			return { resumed: false };
		},
	});
	expect(result).toEqual({ terminalId: "view", label: "Claude" });
	expect(reads).toBe(0);
	expect(resumes).toBe(0);
});
test("a cleanly ended conversation can resume only its same immutable original account", async () => {
	const requested: unknown[] = [];
	const result = await continueNativeBackground(input, {
		reconnect: async () => ({ reconnected: false }),
		source: async () => ({
			provider: "claude",
			ready: true,
			revision: input.expectedRevision,
			account: { selection: "/original/profile", identity: "exact-original" },
		}),
		resume: async (request) => {
			requested.push(request);
			return { resumed: true, terminalId: "exact-replay", label: "Claude" };
		},
	});
	expect(result?.terminalId).toBe("exact-replay");
	expect(requested).toEqual([
		{
			...input,
			account: { selection: "/original/profile", identity: "exact-original" },
		},
	]);
});
test("changed or incomplete source context cannot become a default-account resume", async () => {
	for (const saved of [
		null,
		{
			provider: "claude",
			ready: false,
			revision: input.expectedRevision,
			account: { selection: null, identity: "account" },
		},
		{
			provider: "claude",
			ready: true,
			revision: "changed",
			account: { selection: "/different", identity: "new" },
		},
	]) {
		let resumes = 0;
		expect(
			await continueNativeBackground(input, {
				reconnect: async () => ({ reconnected: false }),
				source: async () => saved,
				resume: async () => {
					resumes++;
					return { resumed: false };
				},
			}),
		).toBeNull();
		expect(resumes).toBe(0);
	}
});
test("a lost attachment response cannot fall through and launch a second worker", async () => {
	let resumes = 0;
	await expect(
		continueNativeBackground(input, {
			reconnect: async () => {
				throw new Error("offline");
			},
			source: async () => null,
			resume: async () => {
				resumes++;
				return { resumed: false };
			},
		}),
	).rejects.toThrow("offline");
	expect(resumes).toBe(0);
});
