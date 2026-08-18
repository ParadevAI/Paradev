"use client";

import { toast } from "@superset/ui/sonner";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string> = {
	oauth_denied:
		"Consent was not granted. A tenant administrator has to approve.",
	missing_params: "Invalid consent response. Please try again.",
	invalid_state: "Invalid state parameter. Please try again.",
	token_exchange_failed:
		"Consent finished but Microsoft did not issue a token for the tenant.",
	subscription_failed:
		"Connected, but Microsoft Graph refused the notification subscriptions.",
	identity_denied:
		'Connected. Sign-in was cancelled, so triggers by "Me" will not match your Teams account until you reconnect.',
	identity_failed:
		'Connected, but your Microsoft account could not be linked. Triggers by "Me" will not match until you reconnect.',
	unauthorized: "You are not authorized to perform this action.",
};

export function ErrorHandler() {
	const searchParams = useSearchParams();

	useEffect(() => {
		const error = searchParams.get("error");
		if (!error) return;

		const detail = searchParams.get("detail");
		let message: string;
		if (error === "tenant_already_linked") {
			message = detail
				? `This Microsoft tenant is already connected by ${detail}. Ask them to disconnect first.`
				: "This Microsoft tenant is already connected by another Superset organization.";
		} else {
			message = ERROR_MESSAGES[error] ?? "Something went wrong.";
			// Graph's own words are the useful part of a refused subscription —
			// they name the missing permission or the protected-API approval.
			if (detail) message = `${message} ${detail}`;
		}

		window.history.replaceState({}, "", "/integrations/microsoft-teams");
		const id = setTimeout(() => toast.error(message), 0);
		return () => clearTimeout(id);
	}, [searchParams]);

	return null;
}
