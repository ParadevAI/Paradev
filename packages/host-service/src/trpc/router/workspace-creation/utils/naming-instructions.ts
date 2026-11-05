import type { ApiClient } from "../../../../types";
import type { NamingInstructions } from "./ai-workspace-names";

const GLOBAL_NAMING_INSTRUCTIONS_TIMEOUT_MS = 3_000;

interface ProjectNamingSettings {
	namingInstructions: string | null;
	ignoreGlobalNamingInstructions: boolean;
}

/**
 * The global text lives in the person's cloud settings. Naming must still
 * run when the API is down or slow, so a failed read means no global text.
 */
export async function resolveNamingInstructions(
	api: Pick<ApiClient, "userSettings">,
	project: ProjectNamingSettings | undefined,
	timeoutMs = GLOBAL_NAMING_INSTRUCTIONS_TIMEOUT_MS,
): Promise<NamingInstructions> {
	const projectText = project?.namingInstructions ?? null;
	if (project?.ignoreGlobalNamingInstructions) {
		return { global: null, project: projectText };
	}
	const global = await api.userSettings.get
		.query(undefined, { signal: AbortSignal.timeout(timeoutMs) })
		.then((settings) => settings.namingInstructions ?? null)
		.catch((error) => {
			console.warn(
				"[naming-instructions] global instructions unavailable",
				error,
			);
			return null;
		});
	return { global, project: projectText };
}
