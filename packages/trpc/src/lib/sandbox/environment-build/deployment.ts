import { env } from "../../../env";

/** Until previews have their own Vercel project, they share production's sandboxes. */
export function isProductionDeployment(): boolean {
	return env.VERCEL_ENV === "production";
}
