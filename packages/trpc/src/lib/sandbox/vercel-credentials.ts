import { env } from "../../env";

export function credentials() {
	return {
		token: env.VERCEL_SANDBOX_TOKEN,
		teamId: env.VERCEL_SANDBOX_TEAM_ID,
		projectId: env.VERCEL_SANDBOX_PROJECT_ID,
	};
}
