import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	type SamplePrompt,
	type SamplePromptTier,
	selectSamplePrompts,
} from "../../components/SamplePrompts/constants";

interface SamplePromptSelection {
	prompts: SamplePrompt[];
	/** The setup verdict has not landed yet. */
	isPending: boolean;
}

/** Picks the sample prompts, leading with setup only when the project needs it. */
export function useSamplePromptSelection(
	tier: SamplePromptTier,
	hostUrl: string | null,
	projectId: string | null,
	count: number,
): SamplePromptSelection {
	const canCheckSetup = Boolean(hostUrl && projectId);

	// Same query the v2 sidebar setup card uses.
	const { data: needsSetupScripts, isPending } = useQuery({
		queryKey: ["host-config", "shouldShowSetupCard", hostUrl, projectId],
		queryFn: () =>
			hostUrl && projectId
				? getHostServiceClientByUrl(hostUrl).config.shouldShowSetupCard.query({
						projectId,
					})
				: false,
		enabled: canCheckSetup,
	});

	if (canCheckSetup && isPending) return { prompts: [], isPending: true };

	return {
		prompts: selectSamplePrompts(tier, needsSetupScripts === true, count),
		isPending: false,
	};
}
