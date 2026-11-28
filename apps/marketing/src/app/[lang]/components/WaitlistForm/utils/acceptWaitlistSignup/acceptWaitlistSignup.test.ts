import { describe, expect, mock, test } from "bun:test";
import { acceptWaitlistSignup } from "./acceptWaitlistSignup";

function deps(withinLimit = true) {
	return {
		isWithinRateLimit: mock(async (_email: string) => withinLimit),
		recordWithoutConsent: mock(async (_email: string) => {}),
	};
}

describe("acceptWaitlistSignup", () => {
	test("records the cleaned address on the server without consent", async () => {
		const d = deps();
		const result = await acceptWaitlistSignup(
			{ email: " Visitor@Example.com\n", analyticsConsent: false },
			d,
		);
		expect(result).toEqual({ ok: true });
		expect(d.recordWithoutConsent.mock.calls).toEqual([
			["visitor@example.com"],
		]);
	});

	test("leaves the address to the consented browser event", async () => {
		const d = deps();
		const result = await acceptWaitlistSignup(
			{ email: "visitor@example.com", analyticsConsent: true },
			d,
		);
		expect(result).toEqual({ ok: true });
		expect(d.isWithinRateLimit).toHaveBeenCalledTimes(1);
		expect(d.recordWithoutConsent).not.toHaveBeenCalled();
	});

	test("rejects a filled honeypot before the rate limit", async () => {
		const d = deps();
		const result = await acceptWaitlistSignup(
			{
				email: "visitor@example.com",
				honeypot: "https://spam.example",
				analyticsConsent: false,
			},
			d,
		);
		expect(result).toEqual({ ok: false, reason: "rejected" });
		expect(d.isWithinRateLimit).not.toHaveBeenCalled();
		expect(d.recordWithoutConsent).not.toHaveBeenCalled();
	});

	test("rejects an invalid address", async () => {
		const d = deps();
		const result = await acceptWaitlistSignup(
			{ email: "not-an-email", analyticsConsent: false },
			d,
		);
		expect(result).toEqual({ ok: false, reason: "invalid_email" });
		expect(d.recordWithoutConsent).not.toHaveBeenCalled();
	});

	test("does not record over the rate limit", async () => {
		const d = deps(false);
		const result = await acceptWaitlistSignup(
			{ email: "visitor@example.com", analyticsConsent: false },
			d,
		);
		expect(result).toEqual({ ok: false, reason: "rate_limited" });
		expect(d.recordWithoutConsent).not.toHaveBeenCalled();
	});

	test("fails when the server record fails", async () => {
		const d = deps();
		d.recordWithoutConsent.mockImplementation(async () => {
			throw new Error("PostHog down");
		});
		await expect(
			acceptWaitlistSignup(
				{ email: "visitor@example.com", analyticsConsent: false },
				d,
			),
		).rejects.toThrow("PostHog down");
	});
});
