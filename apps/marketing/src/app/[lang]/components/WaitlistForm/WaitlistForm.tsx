"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { canTrack, hasCookielessAnalytics } from "@/lib/analytics/consent";
import { trackExternalFormSubmission } from "@/lib/analytics/external-tracking-runtime";
import { joinWaitlist } from "./actions";
import { WAITLIST_PLATFORM } from "./constants";

interface WaitlistFormProps {
	heading?: string;
	description?: string;
}

export function WaitlistForm({ heading, description }: WaitlistFormProps) {
	const { t, i18n } = useLingui();
	const [email, setEmail] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const [error, setError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!email || isSubmitting) return;
		const formData = new FormData(event.currentTarget);
		const honeypot = String(formData.get("company-website") ?? "");
		const analyticsConsent = canTrack() && !hasCookielessAnalytics();

		setError("");
		setIsSubmitting(true);
		try {
			const result = await joinWaitlist(
				{ email, honeypot, analyticsConsent },
				i18n.locale,
			);
			if (!result.success) {
				setError(result.error);
				return;
			}

			track("waitlist_signup", { email, platform: WAITLIST_PLATFORM });
			trackExternalFormSubmission("windows-linux-waitlist", email);
			setSubmitted(true);
		} catch {
			setError(
				t({
					message: "Something went wrong. Please try again.",
				}),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	if (submitted) {
		return (
			<div aria-live="polite">
				<h2 className="mb-2 text-xl font-medium text-foreground">
					<Trans>You're on the list!</Trans>
				</h2>
				<p className="text-sm text-muted-foreground">
					<Trans>We'll notify you when Windows support is ready.</Trans>
				</p>
			</div>
		);
	}

	return (
		<>
			{heading && (
				<h2 className="mb-2 text-xl font-medium text-foreground">{heading}</h2>
			)}
			{description && (
				<p className="mb-6 text-sm text-muted-foreground">{description}</p>
			)}
			<form onSubmit={handleSubmit} className="flex flex-col gap-3">
				<input
					type="email"
					required
					placeholder="you@example.com"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				/>
				<input
					type="text"
					name="company-website"
					tabIndex={-1}
					autoComplete="off"
					className="hidden"
					aria-hidden="true"
				/>
				<button
					type="submit"
					disabled={isSubmitting}
					className="w-full rounded-lg bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
				>
					{isSubmitting ? (
						<Trans>Sending…</Trans>
					) : (
						<Trans>Join waitlist</Trans>
					)}
				</button>
				{error ? (
					<p className="text-sm text-red-500" role="alert">
						{error}
					</p>
				) : null}
			</form>
		</>
	);
}
