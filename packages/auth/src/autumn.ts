import { Autumn } from "autumn-js";
import { env } from "./env";

export const AUTUMN_API_VERSION = "2.4.0";

export const autumnClient = new Autumn({
	secretKey: env.AUTUMN_SECRET_KEY,
	xApiVersion: AUTUMN_API_VERSION,
	failOpen: false,
});

export const billingUsesAutumn = env.BILLING_PROVIDER === "autumn";
