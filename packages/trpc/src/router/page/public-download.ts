import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "../../env";
import { presignedGetUrl } from "../../lib/r2";

export const PUBLIC_DOWNLOAD_SECONDS = 5 * 60;

const downloadRateLimit =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Ratelimit({
				redis: new Redis({
					url: env.KV_REST_API_URL,
					token: env.KV_REST_API_TOKEN,
				}),
				limiter: Ratelimit.slidingWindow(60, "1 m"),
				prefix: "ratelimit:page:public-download",
			})
		: null;

export function limitAllows(result: {
	success: boolean;
	reason?: string;
}): boolean {
	return result.success && result.reason !== "timeout";
}

async function withinDownloadLimit(key: string): Promise<boolean> {
	if (!downloadRateLimit) {
		if (env.NODE_ENV !== "production") return true;
		console.error("[page/public-download] rate limit is not configured");
		return false;
	}
	try {
		const result = await downloadRateLimit.limit(key);
		if (result.reason === "timeout") {
			console.error("[page/public-download] rate limiter timed out");
		}
		return limitAllows(result);
	} catch (error) {
		console.error("[page/public-download] rate limiter unavailable:", error);
		return false;
	}
}

/** Null instead of an error, so the view itself never fails. */
export async function publicDownloadUrl({
	storageKey,
	requester,
	withinLimit = withinDownloadLimit,
	presign = presignedGetUrl,
}: {
	storageKey: string;
	requester: string;
	withinLimit?: (key: string) => Promise<boolean>;
	presign?: (key: string, expiresInSeconds: number) => Promise<string>;
}): Promise<string | null> {
	if (!(await withinLimit(requester))) return null;
	try {
		return await presign(storageKey, PUBLIC_DOWNLOAD_SECONDS);
	} catch (error) {
		console.error("[page/public-download] presign failed", {
			storageKey,
			error,
		});
		return null;
	}
}
