import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useCloudAgentChoices } from "renderer/hooks/useCloudAgentChoices";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";

/** The agents an automation on `hostId` can run; a cloud one has no host to ask. */
export function useAutomationAgentChoices(hostId: string | null | undefined) {
	const cloud = hostId === CLOUD_HOST_ID;
	const hostUrl = useHostUrl(hostId);
	const hostChoices = useV2AgentChoices(hostUrl);
	const cloudChoices = useCloudAgentChoices();
	return cloud ? { agents: cloudChoices, isFetched: true } : hostChoices;
}
