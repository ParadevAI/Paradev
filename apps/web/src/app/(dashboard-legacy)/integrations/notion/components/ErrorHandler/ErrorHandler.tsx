"use client";

import { toast } from "@superset/ui/sonner";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string> = {
	oauth_denied: "Authorization was denied. Please try again.",
	missing_params: "Invalid OAuth response. Please try again.",
	invalid_state: "Invalid state parameter. Please try again.",
	token_exchange_failed: "Failed to connect to Notion. Please try again.",
	not_configured: "Notion is not configured for this environment.",
	unauthorized: "You are not authorized to perform this action.",
};

export function ErrorHandler() {
	const searchParams = useSearchParams();

	useEffect(() => {
		const error = searchParams.get("error");
		if (!error) return;

		const message = ERROR_MESSAGES[error] ?? "Something went wrong.";

		window.history.replaceState({}, "", "/integrations/notion");
		const id = setTimeout(() => toast.error(message), 0);
		return () => clearTimeout(id);
	}, [searchParams]);

	return null;
}
