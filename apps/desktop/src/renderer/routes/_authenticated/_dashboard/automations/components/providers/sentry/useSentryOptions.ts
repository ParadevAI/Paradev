import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ProviderOptions } from "../types";
import { SENTRY_LEVELS } from "./grammar";

/** The pickable values a Sentry sentence needs: projects, and the fixed levels. */
export function useSentryOptions(organizationId: string): ProviderOptions {
	// The numeric project id is what the matcher compares against — a slug would
	// stop matching the moment someone renames the project.
	const projects = cloudTrpc.integration.sentry.listProjects.useQuery(
		{ organizationId },
		{ enabled: Boolean(organizationId) },
	);

	return useMemo(
		() => ({
			sentry: {
				projects: (projects.data ?? []).map((project) => ({
					id: project.id,
					label: project.slug,
				})),
				levels: SENTRY_LEVELS,
			},
		}),
		[projects.data],
	);
}
