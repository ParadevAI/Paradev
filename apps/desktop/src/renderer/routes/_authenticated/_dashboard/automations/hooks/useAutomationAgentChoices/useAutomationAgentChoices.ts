import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useAgentChoices } from "renderer/hooks/useAgentChoices";
import { useCloudAgentChoices } from "renderer/hooks/useCloudAgentChoices";

/** The agents an automation on `hostId` can run; a cloud one has no host to ask. */
export function useAutomationAgentChoices(hostId: string | null | undefined) {
	const cloud = hostId === CLOUD_HOST_ID;
	const hostUrl = useHostUrl(hostId);
	const hostChoices = useAgentChoices(hostUrl);
	const cloudChoices = useCloudAgentChoices();
	return cloud ? { agents: cloudChoices, isFetched: true } : hostChoices;
}
