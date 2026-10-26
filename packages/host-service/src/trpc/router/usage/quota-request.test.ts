import { expect, test } from "bun:test";
import { createQuotaRequestBudget } from "./quota-request";

test("a compatibility fallback consumes the original deadline instead of opening a new one", async () => {
	let now = 0,
		calls = 0;
	const budget = createQuotaRequestBudget(8_000, () => now);
	expect(
		await budget.run(async () => {
			calls++;
			now = 8_000;
			return "unsupported";
		}),
	).toBe("unsupported");
	await expect(
		budget.run(async () => {
			calls++;
			return "fallback";
		}),
	).rejects.toThrow("timed out");
	expect(calls).toBe(1);
});
test("body failures and completed requests abort their own scope without aborting another request", async () => {
	const budget = createQuotaRequestBudget();
	let signal: AbortSignal | undefined;
	await expect(
		budget.run(async (current) => {
			signal = current;
			throw new Error("body failed");
		}),
	).rejects.toThrow("body failed");
	expect(signal?.aborted).toBe(true);
	expect(
		await budget.run(async (current) => {
			expect(current.aborted).toBe(false);
			return 1;
		}),
	).toBe(1);
});
