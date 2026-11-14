import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import type { ApiClient } from "../../../../../lib/api-client";
import {
	type HostProject,
	resolveHostTarget,
} from "../../../../../lib/host-target";

export interface SourceProject {
	hostId: string;
	project: HostProject;
}

/**
 * The project as another host of the organization has it: on `fromHostId`
 * when given, otherwise on the only other reachable host that has it.
 */
export async function findSourceProject(args: {
	api: ApiClient;
	userJwt: string;
	organizationId: string;
	projectId: string;
	targetHostId: string;
	fromHostId?: string;
}): Promise<SourceProject> {
	const projectOn = async (hostId: string) => {
		const host = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId: args.organizationId,
			userJwt: args.userJwt,
			api: args.api,
		});
		return host.client.project.get.query({ projectId: args.projectId });
	};

	if (args.fromHostId) {
		const project = await projectOn(args.fromHostId);
		if (!project) {
			throw new CLIError(
				`Host ${args.fromHostId} does not have project ${args.projectId}`,
				`See its projects with: superset projects list --host ${args.fromHostId}`,
			);
		}
		return { hostId: args.fromHostId, project };
	}

	const localHostId = getHostId();
	const hosts = (
		await args.api.host.list.query({ organizationId: args.organizationId })
	).filter(
		(host) =>
			host.id !== args.targetHostId && (host.online || host.id === localHostId),
	);
	const found = (
		await Promise.all(
			hosts.map(async (host) => {
				const project = await projectOn(host.id).catch(() => null);
				return project ? { host, project } : null;
			}),
		)
	).filter((entry) => entry !== null);

	const [only, ...rest] = found;
	if (!only) {
		throw new CLIError(
			`No other online host has project ${args.projectId}`,
			"Start the host that has it, or pass --from-host <id>",
		);
	}
	if (rest.length > 0) {
		throw new CLIError(
			`Several hosts have project ${args.projectId}: ${found
				.map(({ host }) => `${host.name} (${host.id})`)
				.join(", ")}`,
			"Pass --from-host <id> to pick one",
		);
	}
	return { hostId: only.host.id, project: only.project };
}
