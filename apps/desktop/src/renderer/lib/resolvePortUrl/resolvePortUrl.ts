import { electronTrpcClient } from "renderer/lib/trpc-client";

/**
 * Turns a port's `http://localhost:<port>` URL into `https://` when the
 * server on that port speaks TLS. Falls back to the URL as given when the
 * check fails.
 */
export async function resolvePortUrl(url: string): Promise<string> {
	try {
		const port = Number(new URL(url).port);
		const scheme = await electronTrpcClient.ports.detectScheme.query({ port });
		return scheme === "https" ? url.replace(/^http:/, "https:") : url;
	} catch {
		return url;
	}
}
