"use server";

import { msg } from "@lingui/core/macro";
import { isSupportedLocale } from "@superset/i18n/locales";
import { getI18nInstance, preloadServerLocale } from "@superset/i18n/server";
import { env } from "@/env";
import { checkEmailFormRateLimit } from "@/lib/email-rate-limit";
import { acceptWaitlistSignup } from "./utils/acceptWaitlistSignup";
import { captureWaitlistSignup } from "./utils/captureWaitlistSignup";

type JoinWaitlistResult = { success: true } | { success: false; error: string };

export async function joinWaitlist(
	data: unknown,
	requestedLocale = "en",
): Promise<JoinWaitlistResult> {
	const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "en";
	await preloadServerLocale(locale);
	const i18n = getI18nInstance(locale);

	try {
		const result = await acceptWaitlistSignup(data, {
			isWithinRateLimit: checkEmailFormRateLimit,
			recordWithoutConsent: (email) =>
				captureWaitlistSignup(email, {
					apiKey: env.NEXT_PUBLIC_POSTHOG_KEY,
					host: env.NEXT_PUBLIC_POSTHOG_HOST,
				}),
		});
		if (result.ok) return { success: true };
		if (result.reason === "invalid_email") {
			return {
				success: false,
				error: i18n._(msg({ message: "Enter a valid email address." })),
			};
		}
		if (result.reason === "rate_limited") {
			return {
				success: false,
				error: i18n._(
					msg({ message: "Too many requests. Please try again later." }),
				),
			};
		}
	} catch (error) {
		console.error("Failed to record waitlist signup:", error);
	}
	return {
		success: false,
		error: i18n._(msg({ message: "Something went wrong. Please try again." })),
	};
}
