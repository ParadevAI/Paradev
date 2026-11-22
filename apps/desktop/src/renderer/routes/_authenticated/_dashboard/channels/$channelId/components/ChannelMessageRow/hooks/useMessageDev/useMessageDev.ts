import { useOrgDevs } from "../../../../hooks/useOrgDevs";

/** The Dev that wrote a message, from the same list the sidebar shows. */
export function useMessageDev(agentId: string | null) {
	const devs = useOrgDevs();
	if (!agentId) return null;
	return devs?.find((dev) => dev.id === agentId) ?? null;
}
