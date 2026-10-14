import type { AppRouter } from "@superset/host-service";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export type SetupImportCandidate =
	inferRouterOutputs<AppRouter>["config"]["getSetupImportCandidates"]["candidates"][number];

/** Setups from other tools that would change this project's Superset setup. */
export function useSetupImportCandidates({
	hostUrl,
	projectId,
	enabled = true,
}: {
	hostUrl: string | null;
	projectId: string | null;
	enabled?: boolean;
}): { candidates: SetupImportCandidate[]; configInvalid: boolean } {
	const { data } = useQuery({
		queryKey: ["host-config", "getSetupImportCandidates", hostUrl, projectId],
		queryFn: () => {
			if (!hostUrl || !projectId) throw new Error("no active host or project");
			return getHostServiceClientByUrl(
				hostUrl,
			).config.getSetupImportCandidates.query({ projectId });
		},
		enabled: enabled && !!hostUrl && !!projectId,
		// A host older than this client has no such procedure.
		retry: false,
		refetchOnWindowFocus: true,
	});
	return {
		candidates: (data?.candidates ?? []).filter(
			(candidate) => candidate.changes.length > 0,
		),
		// Older hosts omit the field.
		configInvalid: data?.configInvalid ?? false,
	};
}
