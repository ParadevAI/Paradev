import { expect, test } from "bun:test";
import { AutumnError } from "autumn-js";
import { planTierToRecord } from "./plan-tier";

function autumnError(status: number) {
	const body = JSON.stringify({ code: "error" });
	return new AutumnError("Autumn request failed", {
		body,
		response: new Response(body, { status }),
	});
}

test("a plan granted in Autumn is recorded without a Stripe subscription", async () => {
	expect(
		await planTierToRecord(async () => ({
			flags: { pro_access: { planId: "pro_v2" } },
		})),
	).toBe("pro");
	expect(await planTierToRecord(async () => ({ flags: {} }))).toBe("free");
});

test("an organization with no Autumn customer is recorded as free", async () => {
	expect(
		await planTierToRecord(async () => {
			throw autumnError(404);
		}),
	).toBe("free");
});

test("a failed Autumn read leaves the stored tier alone", async () => {
	for (const status of [401, 429, 500]) {
		expect(
			await planTierToRecord(async () => {
				throw autumnError(status);
			}),
		).toBeNull();
	}
	expect(
		await planTierToRecord(async () => {
			throw new DOMException("timeout", "TimeoutError");
		}),
	).toBeNull();
});
