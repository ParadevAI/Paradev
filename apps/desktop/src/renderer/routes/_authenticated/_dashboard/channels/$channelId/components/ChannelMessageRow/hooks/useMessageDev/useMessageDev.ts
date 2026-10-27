import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/** The Dev that wrote a message, from the same list the sidebar shows. */
export function useMessageDev(agentId: string | null) {
	const organizationId = useActiveOrganizationId();
	const { data: devs } = cloudTrpc.agent.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: agentId !== null && organizationId !== null },
	);
	if (!agentId) return null;
	return devs?.find((dev) => dev.id === agentId) ?? null;
}
