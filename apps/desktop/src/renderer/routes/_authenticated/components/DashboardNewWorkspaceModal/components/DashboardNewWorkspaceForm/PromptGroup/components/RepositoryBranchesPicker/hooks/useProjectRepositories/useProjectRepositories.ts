import { useQuery } from "@tanstack/react-query";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export function useProjectRepositories(
	projectId: string,
	hostId: string | null,
) {
	const hostUrl = useHostUrl(hostId);
	return (
		useQuery({
			queryKey: ["project", "repositories", hostUrl, projectId],
			enabled: !!hostUrl,
			queryFn: () =>
				getHostServiceClientByUrl(hostUrl as string).project.repositories.query(
					{
						projectId,
					},
				),
		}).data ?? []
	);
}
