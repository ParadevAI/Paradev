"use client";

import { toast } from "@superset/ui/sonner";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string> = {
	not_configured:
		"Sentry isn't available yet — the Superset app hasn't been registered with Sentry.",
	oauth_denied: "The install was cancelled. Please try again.",
	missing_params: "Invalid response from Sentry. Please try again.",
	invalid_state: "Your session expired. Start the connection again.",
	unauthorized: "You are not authorized to perform this action.",
	token_exchange_failed:
		"Failed to complete the Sentry install. Please try again.",
	organization_lookup_failed:
		"Connected, but couldn't read your Sentry organization. Please reconnect.",
};

export function ErrorHandler() {
	const searchParams = useSearchParams();

	useEffect(() => {
		const error = searchParams.get("error");
		if (!error) return;
		const message = ERROR_MESSAGES[error] ?? "Something went wrong.";
		window.history.replaceState({}, "", "/integrations/sentry");
		const id = setTimeout(() => toast.error(message), 0);
		return () => clearTimeout(id);
	}, [searchParams]);

	return null;
}
