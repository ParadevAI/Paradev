import { describe, expect, test } from "bun:test";
import {
	beginWaitSchema,
	listCardsSchema,
	MAX_WAIT_SECONDS,
	MIN_WHY_LENGTH,
	pushCardSchema,
	resolveCardSchema,
} from "./schema";

const validPush = {
	title: "Approve 3 refunds over my $50 limit",
	why: "Each is above the limit I was given, and the policy does not say who may lift it",
	agentSessionId: "cli-b375b5ab",
};

describe("pushCardSchema", () => {
	test("accepts the minimal card", () => {
		expect(pushCardSchema.parse(validPush)).toMatchObject(validPush);
	});

	test("refuses a session id in Superset's own namespace", () => {
		expect(
			pushCardSchema.safeParse({
				...validPush,
				agentSessionId: "superset:task",
			}).success,
		).toBe(false);
	});

	test("refuses a why shorter than the floor", () => {
		const why = "x".repeat(MIN_WHY_LENGTH - 1);
		expect(pushCardSchema.safeParse({ ...validPush, why }).success).toBe(false);
	});

	test("trims before measuring the why", () => {
		const why = `  ${"x".repeat(MIN_WHY_LENGTH - 1)}  `;
		expect(pushCardSchema.safeParse({ ...validPush, why }).success).toBe(false);
	});

	test("coerces showAt from an ISO string", () => {
		const parsed = pushCardSchema.parse({
			...validPush,
			showAt: "2026-09-18T09:00:00.000Z",
		});
		expect(parsed.showAt).toBeInstanceOf(Date);
		expect(parsed.showAt?.toISOString()).toBe("2026-09-18T09:00:00.000Z");
	});

	test("refuses a page id that is not a uuid", () => {
		expect(
			pushCardSchema.safeParse({ ...validPush, pageId: "agent-inbox-ijegtc" })
				.success,
		).toBe(false);
	});
});

describe("listCardsSchema", () => {
	test("defaults to the open view", () => {
		expect(listCardsSchema.parse(undefined)).toBeUndefined();
		expect(listCardsSchema.parse({})).toEqual({ view: "open", limit: 50 });
	});

	test("caps the limit", () => {
		expect(listCardsSchema.safeParse({ limit: 201 }).success).toBe(false);
	});
});

describe("resolveCardSchema", () => {
	test("defaults the outcome to answered", () => {
		const parsed = resolveCardSchema.parse({
			id: "614cf848-c4fb-432f-890f-625cb7ee4985",
		});
		expect(parsed.outcome).toEqual({ kind: "answered" });
	});

	test("refuses an outcome kind outside the contract", () => {
		expect(
			resolveCardSchema.safeParse({
				id: "614cf848-c4fb-432f-890f-625cb7ee4985",
				outcome: { kind: "snoozed" },
			}).success,
		).toBe(false);
	});
});

describe("beginWaitSchema", () => {
	test("bounds the timeout to a day", () => {
		const base = {
			id: "614cf848-c4fb-432f-890f-625cb7ee4985",
			agentSessionId: "cli-b375b5ab",
		};
		expect(
			beginWaitSchema.safeParse({ ...base, timeoutSeconds: MAX_WAIT_SECONDS })
				.success,
		).toBe(true);
		expect(
			beginWaitSchema.safeParse({
				...base,
				timeoutSeconds: MAX_WAIT_SECONDS + 1,
			}).success,
		).toBe(false);
		expect(
			beginWaitSchema.safeParse({ ...base, timeoutSeconds: 0 }).success,
		).toBe(false);
	});
});
