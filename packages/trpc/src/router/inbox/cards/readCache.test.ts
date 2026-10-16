import { beforeEach, describe, expect, mock, test } from "bun:test";
import { forgetReader, readCard } from "./readCache";
import type { CardContext, ResolvedCard } from "./types";

const ref = { type: "slack.thread", refs: { channel: "C1", thread_ts: "1.2" } };
const ctx = (readerId: string): CardContext => ({
	readerId,
	organizationId: "org",
});
const card = (title: string) => ({ title }) as ResolvedCard;

beforeEach(() => {
	forgetReader("ann");
	forgetReader("bo");
});

describe("reading a card the reader opened seconds ago", () => {
	test("the integration is read once for two reads close together, and again after the fresh window", async () => {
		const resolve = mock(async () => card("thread"));
		await readCard(ref, ctx("ann"), resolve, 1_000);
		await readCard(ref, ctx("ann"), resolve, 15_000);
		expect(resolve).toHaveBeenCalledTimes(1);
		await readCard(ref, ctx("ann"), resolve, 21_001);
		expect(resolve).toHaveBeenCalledTimes(2);
	});

	test("one reader never gets what was resolved for another, or for other refs", async () => {
		const resolve = mock(async () => card("thread"));
		await readCard(ref, ctx("ann"), resolve, 1_000);
		await readCard(ref, ctx("bo"), resolve, 1_001);
		await readCard(
			{ ...ref, refs: { ...ref.refs, thread_ts: "9.9" } },
			ctx("ann"),
			resolve,
			1_002,
		);
		expect(resolve).toHaveBeenCalledTimes(3);
	});

	test("after the reader acts, the next read is live", async () => {
		const resolve = mock(async () => card("thread"));
		await readCard(ref, ctx("ann"), resolve, 1_000);
		forgetReader("ann");
		await readCard(ref, ctx("ann"), resolve, 1_500);
		expect(resolve).toHaveBeenCalledTimes(2);
	});

	test("a read that failed is not kept", async () => {
		const failing = mock(async () => {
			throw new Error("Slack is down");
		});
		await expect(readCard(ref, ctx("ann"), failing, 1_000)).rejects.toThrow();
		const resolve = mock(async () => card("thread"));
		await readCard(ref, ctx("ann"), resolve, 1_100);
		expect(resolve).toHaveBeenCalledTimes(1);
	});
});
