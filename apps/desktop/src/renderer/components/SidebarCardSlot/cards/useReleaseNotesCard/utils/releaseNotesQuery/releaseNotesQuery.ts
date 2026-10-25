import {
	RELEASE_NOTES_PATH,
	releaseNotesResponseSchema,
} from "@superset/shared/release-notes";
import { queryOptions } from "@tanstack/react-query";
import { env } from "renderer/env.renderer";

const ONE_HOUR_MS = 60 * 60 * 1000;

export const releaseNotesQuery = queryOptions({
	queryKey: ["release-notes"],
	queryFn: async () => {
		const response = await fetch(
			`${env.NEXT_PUBLIC_MARKETING_URL}${RELEASE_NOTES_PATH}`,
		);
		if (!response.ok) {
			throw new Error(`release notes fetch failed: ${response.status}`);
		}
		return releaseNotesResponseSchema.parse(await response.json());
	},
	staleTime: ONE_HOUR_MS,
	refetchInterval: ONE_HOUR_MS,
	refetchOnWindowFocus: true,
});
