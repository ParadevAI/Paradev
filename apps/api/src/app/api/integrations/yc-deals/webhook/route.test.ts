import { beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { db, dbWs } from "@superset/db/client";
import { env } from "@/env";
import { stub } from "../../../../../../test/stub";
import type { PromoCode } from "./addRewardPromoCode";

const REWARD_ID = "yc-bookface-6mo-pro";

let rewardCodes: PromoCode[] = [];
let dropOnWrite: string[] = [];
let autumnWrites = 0;
let emailedCodes: string[] = [];
let existingRow: { status: string } | undefined;
let insertedRows: Array<Record<string, unknown>> = [];

async function fakeFetch(input: string | URL | Request, init?: RequestInit) {
	const url = String(input instanceof Request ? input.url : input);
	const body = JSON.parse(String(init?.body ?? "{}"));
	if (url === "https://api.useautumn.com/v1/rewards.get") {
		if (body.reward_id !== REWARD_ID) {
			return Response.json({ message: "not found" }, { status: 404 });
		}
		return Response.json({
			coupon: { id: REWARD_ID, promo_codes: rewardCodes },
		});
	}
	if (url === "https://api.useautumn.com/v1/rewards.update") {
		autumnWrites++;
		const codes = body.coupon.promo_codes as PromoCode[];
		if (codes.some((c) => !/^[a-zA-Z0-9]+$/.test(c.code))) {
			return Response.json(
				{ message: "Promotional code can only contain letters and numbers" },
				{ status: 400 },
			);
		}
		rewardCodes = codes.filter((c) => !dropOnWrite.includes(c.code));
		return Response.json({ coupon: { id: REWARD_ID } });
	}
	if (url.startsWith("https://api.resend.com/emails")) {
		emailedCodes.push(String(body.html).match(/\bYC[A-Z0-9]{8}\b/)?.[0] ?? "");
		return Response.json({ id: "email_1" });
	}
	throw new Error(`Unexpected fetch ${url}`);
}

stub(env, { YC_BOOKFACE_DEAL_ID: 13843 });
stub(globalThis, { fetch: fakeFetch });
stub(dbWs, {
	transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
		fn({ execute: async () => ({ rows: [] }) }),
});
stub(db.query.dealRedemptions, { findFirst: async () => existingRow });
stub(db, {
	insert: () => ({
		values: (row: Record<string, unknown>) => {
			insertedRows.push(row);
			return { onConflictDoNothing: async () => undefined };
		},
	}),
});

const { POST } = await import("./route");
const { addRewardPromoCode } = await import("./addRewardPromoCode");

function signed(payload: unknown): Request {
	const body = JSON.stringify(payload);
	const signature = createHmac("sha256", "test-secret")
		.update(body)
		.digest("hex");
	return new Request("https://api.test/api/integrations/yc-deals/webhook", {
		method: "POST",
		body,
		headers: { "x-yc-signature": signature },
	});
}

const REDEMPTION = {
	id: 42,
	deal_id: 13843,
	email: "Founder@Example.com ",
	first_name: "Ada",
	last_name: "Lovelace",
	companies: [{ name: "Acme", batch: "F26" }],
};

const EXISTING_CODE: PromoCode = {
	code: "YCEXISTING",
	global_max_redemption: 1,
	first_time_transaction: null,
};

beforeEach(() => {
	rewardCodes = [EXISTING_CODE];
	dropOnWrite = [];
	autumnWrites = 0;
	emailedCodes = [];
	existingRow = undefined;
	insertedRows = [];
});

describe("YC Bookface webhook", () => {
	test("adds a single-use code to the Autumn reward, keeps the others, and emails it", async () => {
		const response = await POST(signed(REDEMPTION));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "code_sent" });

		const added = rewardCodes.find((c) => c.code !== EXISTING_CODE.code);
		expect(rewardCodes[0]).toEqual(EXISTING_CODE);
		expect(added).toMatchObject({ global_max_redemption: 1 });
		expect(added?.code).toMatch(/^YC[A-Z0-9]{8}$/);
		expect(emailedCodes).toEqual([added?.code as string]);
		expect(insertedRows[0]).toMatchObject({
			email: "founder@example.com",
			status: "code_sent",
			promotionCode: added?.code,
		});
	});

	test("a retried delivery does not mint another code", async () => {
		existingRow = { status: "code_sent" };
		const response = await POST(signed(REDEMPTION));
		expect(await response.json()).toEqual({ status: "code_sent" });
		expect(autumnWrites).toBe(0);
		expect(emailedCodes).toEqual([]);
	});

	test("a code lost by a concurrent write fails the delivery before emailing", async () => {
		dropOnWrite = [EXISTING_CODE.code];
		const response = await POST(signed(REDEMPTION));
		expect(response.status).toBe(500);
		expect(emailedCodes).toEqual([]);
		expect(insertedRows).toEqual([]);
	});
});

describe("addRewardPromoCode", () => {
	test("does not write when the code is already on the reward", async () => {
		await addRewardPromoCode(REWARD_ID, EXISTING_CODE);
		expect(autumnWrites).toBe(0);
	});
});
