import type { MachineSize } from "@superset/shared/billing";
import {
	type CloudCreateChoice,
	latestCloudChoice,
	NO_PROJECT_KEY,
} from "renderer/stores/v2-workspace-create-defaults";
import { groupEnvironmentsForProject } from "../groupEnvironmentsForProject";

interface ResolvableEnvironment {
	id: string;
	projectIds?: readonly string[] | null;
	repositories?: ReadonlyArray<{ fullName: string }> | null;
}

/**
 * What the cloud pills show for a project. A project gets the environment and
 * size last used with it, else its first linked environment. Without a
 * project it gets the newest environment used anywhere. An unlinked project
 * never inherits another project's environment: that would clone the wrong
 * repository.
 */
export function resolveCloudChoices<T extends ResolvableEnvironment>({
	environments,
	projectId,
	repositoryFullName,
	choices,
	offeredSizes,
	defaultSize,
}: {
	environments: readonly T[];
	projectId: string | null;
	repositoryFullName: string | null;
	choices: Record<string, CloudCreateChoice>;
	offeredSizes: readonly MachineSize[];
	defaultSize: MachineSize;
}): {
	linked: T[];
	other: T[];
	environment: T | null;
	machineSize: MachineSize;
} {
	const remembered = choices[projectId ?? NO_PROJECT_KEY];
	const byId = new Map(environments.map((row) => [row.id, row]));
	const { linked, other } = projectId
		? groupEnvironmentsForProject({
				environments,
				projectId,
				repositoryFullName,
			})
		: { linked: [], other: [...environments] };

	const rememberedEnvironment = remembered?.environmentId
		? byId.get(remembered.environmentId)
		: undefined;
	const latestEnvironmentId = projectId
		? null
		: latestCloudChoice(choices, "environmentId", (id) => byId.has(id));
	const environment =
		rememberedEnvironment ??
		(projectId
			? linked[0]
			: ((latestEnvironmentId ? byId.get(latestEnvironmentId) : undefined) ??
				other[0])) ??
		null;

	const isOffered = (size: MachineSize) => offeredSizes.includes(size);
	const machineSize =
		(remembered?.machineSize && isOffered(remembered.machineSize)
			? remembered.machineSize
			: null) ??
		latestCloudChoice(choices, "machineSize", isOffered) ??
		defaultSize;

	return { linked, other, environment, machineSize };
}
