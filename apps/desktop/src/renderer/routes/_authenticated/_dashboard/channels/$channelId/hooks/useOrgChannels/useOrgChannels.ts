import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/** The active organization's channels the reader can see, by name. */
export function useOrgChannels() {
	const organizationId = useActiveOrganizationId();
	const { data } = cloudTrpc.channel.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);
	return data;
}
