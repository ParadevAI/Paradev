import { useCallback, useRef, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface EnvironmentRepository {
	id: string;
	name: string;
}

/**
 * Makes the personal environment a project's first cloud workspace starts
 * from: its repository alone, linked to the project.
 */
export function useCreateProjectEnvironment(organizationId: string | null) {
	const utils = cloudTrpc.useUtils();
	const create = cloudTrpc.environment.create.useMutation();
	const inFlightRef = useRef(false);
	const [isCreating, setIsCreating] = useState(false);

	const createEnvironment = useCallback(
		async ({
			repository,
			projectId,
		}: {
			repository: EnvironmentRepository;
			projectId: string | null;
		}): Promise<string | null> => {
			if (!organizationId || inFlightRef.current) return null;
			inFlightRef.current = true;
			setIsCreating(true);
			try {
				const environment = await create.mutateAsync({
					organizationId,
					name: repository.name,
					repositoryIds: [repository.id],
					primaryRepositoryId: repository.id,
					scope: "personal",
					...(projectId ? { projectId } : {}),
				});
				void utils.environment.list.invalidate();
				void utils.billing.environmentUsage.invalidate();
				return environment.id;
			} finally {
				inFlightRef.current = false;
				setIsCreating(false);
			}
		},
		[organizationId, create, utils],
	);

	return { createEnvironment, isCreating };
}
