import { Autumn } from "autumn-js";
import { env } from "./env";
import { localMode } from "./local-mode";

export const AUTUMN_API_VERSION = "2.4.0";

export const autumnClient = new Autumn({
	// A personal installation has no Autumn account and never registers the
	// billing plugin, so the key is absent; a placeholder keeps construction
	// from throwing at import time the way stripe.ts does.
	secretKey: localMode ? "am_sk_local_disabled" : env.AUTUMN_SECRET_KEY,
	xApiVersion: AUTUMN_API_VERSION,
	failOpen: false,
});

export const billingUsesAutumn =
	!localMode && env.BILLING_PROVIDER === "autumn";
