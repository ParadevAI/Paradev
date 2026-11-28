import { z } from "zod";
import { sanitizeSingleLine } from "@/lib/form-utils";

const waitlistSignupSchema = z.object({
	email: z.string(),
	honeypot: z.string().optional(),
	analyticsConsent: z.boolean(),
});

export type WaitlistSignupResult =
	| { ok: true }
	| { ok: false; reason: "invalid_email" | "rejected" | "rate_limited" };

interface AcceptWaitlistSignupDeps {
	isWithinRateLimit: (email: string) => Promise<boolean>;
	recordWithoutConsent: (email: string) => Promise<void>;
}

/** With consent the browser event keeps the address; without it the server records it. */
export async function acceptWaitlistSignup(
	data: unknown,
	{ isWithinRateLimit, recordWithoutConsent }: AcceptWaitlistSignupDeps,
): Promise<WaitlistSignupResult> {
	const parsed = waitlistSignupSchema.safeParse(data);
	if (!parsed.success) return { ok: false, reason: "invalid_email" };

	const { email, honeypot, analyticsConsent } = parsed.data;
	if (honeypot) return { ok: false, reason: "rejected" };

	const sanitizedEmail = sanitizeSingleLine(email).toLowerCase();
	if (!z.email().safeParse(sanitizedEmail).success) {
		return { ok: false, reason: "invalid_email" };
	}

	if (!(await isWithinRateLimit(sanitizedEmail))) {
		return { ok: false, reason: "rate_limited" };
	}

	if (!analyticsConsent) await recordWithoutConsent(sanitizedEmail);
	return { ok: true };
}
