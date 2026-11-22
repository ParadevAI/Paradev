import {
	type AutumnRestPlan,
	fromAutumnRest,
	type PlanFamily,
	planCatalogFromAutumn,
} from "@superset/shared/billing";
import { Redis } from "@upstash/redis";
import { cacheLife } from "next/cache";
import { env } from "@/env";

const AUTUMN_PLANS_URL = "https://api.useautumn.com/v1/plans.list";
const AUTUMN_API_VERSION = "2.4.0";
const AUTUMN_TIMEOUT_MS = 3000;
const LAST_GOOD_KEY = `marketing:plan-catalog:${
	env.AUTUMN_SECRET_KEY.startsWith("am_sk_test") ? "sandbox" : "live"
}:last`;

export async function fetchPlanCatalog(): Promise<PlanFamily[]> {
	"use cache";
	const redis = new Redis({
		url: env.KV_REST_API_URL,
		token: env.KV_REST_API_TOKEN,
	});
	try {
		const response = await fetch(AUTUMN_PLANS_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.AUTUMN_SECRET_KEY}`,
				"Content-Type": "application/json",
				"x-api-version": AUTUMN_API_VERSION,
			},
			body: "{}",
			signal: AbortSignal.timeout(AUTUMN_TIMEOUT_MS),
		});
		if (!response.ok) {
			throw new Error(`Autumn plans.list answered ${response.status}`);
		}
		const { list } = (await response.json()) as { list: AutumnRestPlan[] };
		const catalog = planCatalogFromAutumn(list.map(fromAutumnRest));
		if (catalog.length === 0) {
			throw new Error("Autumn returned no self-serve plans");
		}
		await redis
			.set(LAST_GOOD_KEY, catalog)
			.catch((error) =>
				console.error("[pricing] last-good write failed", error),
			);
		cacheLife("hours");
		return catalog;
	} catch (error) {
		console.error("[pricing] serving the last good plan catalog", error);
		cacheLife("minutes");
		return (
			(await redis.get<PlanFamily[]>(LAST_GOOD_KEY).catch(() => null)) ?? []
		);
	}
}
