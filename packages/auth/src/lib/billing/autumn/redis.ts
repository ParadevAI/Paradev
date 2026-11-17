import { Redis } from "@upstash/redis";
import { env } from "../../../env";

export const billingRedis = new Redis({
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});
