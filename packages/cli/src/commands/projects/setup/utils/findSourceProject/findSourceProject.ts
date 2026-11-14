import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import type { ApiClient } from "../../../../../lib/api-client";
import {
	type HostProject,
	resolveHostTarget,
} from "../../../../../lib/host-target";

export class HostsDisagreeError extends CLIError {}

export interface SourceProject {
	hostId: string;
	project: HostProject;
}

interface SourceArgs {
	api: ApiClient;
	userJwt: string;
	organizationId: string;
	projectId: string;
	targetHostId: string;
	fromHostId?: string;
}

async function projectOn(
	args: SourceArgs,
	hostId: string,
): Promise<HostProject | null> {
	const host = await resolveHostTarget({
		requestedHostId: hostId,
		organizationId: args.organizationId,
		userJwt: args.userJwt,
		api: args.api,
	});
	return host.client.project.get.query({ projectId: args.projectId });
}

async function projectOnFromHost(
	args: SourceArgs & { fromHostId: string },
): Promise<SourceProject> {
	const project = await projectOn(args, args.fromHostId);
	if (!project) {
		throw new CLIError(
			`Host ${args.fromHostId} does not have project ${args.projectId}`,
			`See its projects with: superset projects list --host ${args.fromHostId}`,
		);
	}
	return { hostId: args.fromHostId, project };
}

async function projectOnOtherHosts(args: SourceArgs) {
	const localHostId = getHostId();
	const hosts = (
		await args.api.host.list.query({ organizationId: args.organizationId })
	).filter(
		(host) =>
			host.id !== args.targetHostId && (host.online || host.id === localHostId),
	);
	return (
		await Promise.all(
			hosts.map(async (host) => {
				const project = await projectOn(args, host.id).catch(() => null);
				return project ? { host, project } : null;
			}),
		)
	).filter((entry) => entry !== null);
}

/**
 * The project as another host of the organization has it: on `fromHostId`
 * when given, otherwise on the only other reachable host that has it.
 */
export async function findSourceProject(
	args: SourceArgs,
): Promise<SourceProject> {
	if (args.fromHostId) {
		return projectOnFromHost({ ...args, fromHostId: args.fromHostId });
	}
	const found = await projectOnOtherHosts(args);
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

/**
 * The project on another host that lists repositories the target host lacks:
 * on `fromHostId` when given, otherwise on any other reachable host. Null when
 * no host lists one.
 */
export async function findSourceWithNewRepositories(
	args: SourceArgs & { known: HostProject },
): Promise<SourceProject | null> {
	const known = new Set((args.known.repositories ?? []).map((r) => r.id));
	const newIds = (project: HostProject) =>
		(project.repositories ?? [])
			.map((r) => r.id)
			.filter((id) => !known.has(id))
			.sort()
			.join("\n");

	if (args.fromHostId) {
		const source = await projectOnFromHost({
			...args,
			fromHostId: args.fromHostId,
		});
		return newIds(source.project) ? source : null;
	}
	const found = (await projectOnOtherHosts(args)).filter(({ project }) =>
		newIds(project),
	);
	const [first] = found;
	if (!first) return null;
	if (found.some(({ project }) => newIds(project) !== newIds(first.project))) {
		throw new HostsDisagreeError(
			`Hosts list different repositories for project ${args.projectId}: ${found
				.map(({ host }) => `${host.name} (${host.id})`)
				.join(", ")}`,
			"Pass --from-host <id> to pick the one to copy from",
		);
	}
	return { hostId: first.host.id, project: first.project };
}
