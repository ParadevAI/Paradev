import { ApiError } from "../http/http.ts";

/** What to show when sending a magic link fails: the server's own words for what it explains (e.g. rate limits). */
export function sendError(err: unknown): string {
	if (err instanceof ApiError && err.status === 400)
		return "Enter a valid email address.";
	if (err instanceof ApiError && err.status < 500) return err.message;
	return "Couldn't reach Paradev. Check your connection and try again.";
}
