import { expect, mock, test } from "bun:test";
import { waitForApproval } from "./waitForApproval";

test("keeps polling a pending sign-in until it is approved", async () => {
	const answers = ["pending", "pending", "connected"];
	const poll = mock(async () => ({ status: answers.shift() ?? "pending" }));
	await waitForApproval({
		poll,
		intervalMs: 0,
		signal: new AbortController().signal,
	});
	expect(poll).toHaveBeenCalledTimes(3);
});

test("stops polling once aborted", async () => {
	const controller = new AbortController();
	const poll = mock(async () => {
		controller.abort();
		return { status: "pending" };
	});
	await expect(
		waitForApproval({ poll, intervalMs: 0, signal: controller.signal }),
	).rejects.toBeDefined();
	expect(poll).toHaveBeenCalledTimes(1);
});

test("an approval that arrives after the wait was aborted does not count", async () => {
	const controller = new AbortController();
	const poll = mock(async () => {
		controller.abort();
		return { status: "connected" };
	});
	await expect(
		waitForApproval({ poll, intervalMs: 0, signal: controller.signal }),
	).rejects.toBeDefined();
});
