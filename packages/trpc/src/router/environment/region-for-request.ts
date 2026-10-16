import {
	DEFAULT_SANDBOX_REGION,
	nearestSandboxRegion,
	type SandboxRegionId,
} from "@superset/shared/sandbox-regions";

/**
 * The sandbox region nearest the caller, from the geo headers Vercel sets on a
 * request; the default when they are missing (local dev, a proxy).
 */
export function regionForRequest(headers: Headers): SandboxRegionId {
	const lat = Number(headers.get("x-vercel-ip-latitude"));
	const lng = Number(headers.get("x-vercel-ip-longitude"));
	return Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)
		? nearestSandboxRegion(lat, lng)
		: DEFAULT_SANDBOX_REGION;
}
