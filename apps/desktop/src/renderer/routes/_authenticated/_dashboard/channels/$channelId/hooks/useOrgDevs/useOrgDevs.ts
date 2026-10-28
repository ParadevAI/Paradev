import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/** The active organization's Devs the reader can see, as the sidebar lists them. */
export function useOrgDevs() {
	const organizationId = useActiveOrganizationId();
	const { data } = cloudTrpc.agent.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);
	return data;
}
