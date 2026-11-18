import { useMemo } from "react";
import { useHostProjectIds } from "renderer/react-query/projects";
import { useGitHubMentionProviders } from "renderer/routes/_authenticated/components/AgentComposer/hooks/useGitHubMentionProviders";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

const MAX_PROJECTS = 8;

/** GitHub issues and pull requests for an @ in a chat, which has no project: those of this machine's projects. */
export function useChatGitHubProviders() {
	const { activeHostUrl } = useLocalHostService();
	const projectIds = useHostProjectIds(activeHostUrl);
	return useGitHubMentionProviders(
		useMemo(
			() =>
				activeHostUrl && projectIds
					? [...projectIds]
							.slice(0, MAX_PROJECTS)
							.map((projectId) => ({ projectId, hostUrl: activeHostUrl }))
					: null,
			[activeHostUrl, projectIds],
		),
	);
}
