import { expect, test } from "bun:test";
import { resumeWithBackgroundReconnect } from "./resume-with-background-reconnect";

function fixture() {
	let resumes = 0;
	let attaches = 0;
	const input = { workspaceId: "workspace", terminalId: "original" };
	const resume = async () => {
		resumes++;
		return { resumed: false as const };
	};
	const recovery = {
		capabilities: async () => ({ version: 1, claudeLiveAttach: true }),
		source: async () => ({ provider: "claude", revision: "a".repeat(64) }),
		reconnect: async (_input: typeof input & { expectedRevision: string }) => {
			attaches++;
			return {
				reconnected: true as const,
				terminalId: "existing-worker-view",
				label: "Claude",
			};
		},
	};
	return { input, resume, recovery, counts: () => ({ resumes, attaches }) };
}
test("Continue focuses the confirmed existing worker and never launches a resume", async () => {
	const f = fixture();
	expect(
		await resumeWithBackgroundReconnect(
			f.input,
			"claude",
			f.recovery,
			f.resume,
		),
	).toEqual({
		resumed: true,
		terminalId: "existing-worker-view",
		label: "Claude",
	});
	expect(f.counts()).toEqual({ resumes: 0, attaches: 1 });
});
test("older hosts fall back only on a missing additive capability", async () => {
	const f = fixture();
	f.recovery.capabilities = async () => {
		throw { data: { code: "NOT_FOUND" } };
	};
	expect(
		await resumeWithBackgroundReconnect(
			f.input,
			"claude",
			f.recovery,
			f.resume,
		),
	).toEqual({ resumed: false });
	expect(f.counts()).toEqual({ resumes: 1, attaches: 0 });
});
test("transport, permission and malformed capability failures never launch another worker", async () => {
	for (const error of [
		new Error("offline"),
		{ data: { code: "UNAUTHORIZED" } },
		{ code: "NOT_FOUND" },
	]) {
		const f = fixture();
		f.recovery.capabilities = async () => {
			throw error;
		};
		await expect(
			resumeWithBackgroundReconnect(f.input, "claude", f.recovery, f.resume),
		).rejects.toBe(error);
		expect(f.counts().resumes).toBe(0);
	}
});
test("verification failure after supported capability never falls through", async () => {
	const f = fixture();
	f.recovery.reconnect = async () => {
		throw new Error("worker changed");
	};
	await expect(
		resumeWithBackgroundReconnect(f.input, "claude", f.recovery, f.resume),
	).rejects.toThrow("worker changed");
	expect(f.counts().resumes).toBe(0);
});
test("an explicit no-background result preserves ordinary resume", async () => {
	const f = fixture();
	const recovery = {
		...f.recovery,
		reconnect: async () => ({ reconnected: false as const }),
	};
	expect(
		await resumeWithBackgroundReconnect(f.input, "claude", recovery, f.resume),
	).toEqual({ resumed: false });
	expect(f.counts().resumes).toBe(1);
});
test("an unconfirmed view is opened but never presented as confirmed identity", async () => {
	const f = fixture();
	const recovery = {
		...f.recovery,
		reconnect: async () => ({
			reconnected: false as const,
			attachmentPending: true as const,
			terminalId: "pending-view",
			label: "Claude",
		}),
	};
	expect(
		await resumeWithBackgroundReconnect(f.input, "claude", recovery, f.resume),
	).toMatchObject({ resumed: true, terminalId: "pending-view" });
	expect(f.counts().resumes).toBe(0);
});
test("Codex does not receive Claude capability or attachment calls", async () => {
	const f = fixture();
	f.recovery.capabilities = async () => {
		throw new Error("should not run");
	};
	await resumeWithBackgroundReconnect(f.input, "codex", f.recovery, f.resume);
	expect(f.counts()).toEqual({ resumes: 1, attaches: 0 });
});
