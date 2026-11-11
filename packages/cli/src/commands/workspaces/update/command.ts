import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { MACHINE_SIZES } from "@superset/shared/billing";
import { tagFolderScope } from "@superset/shared/workspace-tags";
import { resolveWorkspaceHost } from "../../../lib/cloud-workspaces";
import { command } from "../../../lib/command";
import {
	type HostServiceClient,
	resolveHostTarget,
} from "../../../lib/host-target";
import { claimGroupTag, loadGroupContext } from "../../../lib/workspace-groups";
import {
	type CloudWorkspaceResize,
	describeResize,
	updateCloudWorkspace,
} from "./updateCloudWorkspace";

export default command({
	description:
		"Update a workspace or move it to a sidebar group: a cloud workspace by default if your account has them, else one on this machine; --local or --host picks a host",
	args: [positional("id").required().desc("Workspace UUID")],
	options: {
		host: string().desc(
			"Host the workspace lives on, or `cloud` (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		name: string().desc("Workspace name"),
		taskId: string().desc(
			"Link the workspace to a task by id. On a cloud workspace, also a task slug, added to its linked tasks",
		),
		clearTask: boolean().desc(
			"Unlink the workspace from its task (on a cloud workspace, from every linked task)",
		),
		group: string().desc(
			"Move the workspace to the sidebar group the desktop shows by this name (case-insensitive), or to a new group by that name. Replaces the workspace's tags",
		),
		tag: string()
			.variadic()
			.desc(
				"Replace the workspace's tag set. Repeatable. Each tag is a sidebar group; a group renamed in the desktop keeps its first tag, so prefer --group",
			),
		clearTags: boolean().desc(
			"Remove every tag, which takes the workspace out of its sidebar group",
		),
		visibility: string()
			.enum("just_me", "org")
			.desc(
				"Who sees a cloud workspace: `just_me` or `org`. Only its creator can change it",
			),
		addLabel: string()
			.variadic()
			.desc(
				"Add a label to a cloud workspace by name, creating the label when it is new. Repeatable",
			),
		removeLabel: string()
			.variadic()
			.desc("Remove a label from a cloud workspace by name. Repeatable"),
		machineSize: string()
			.enum(...MACHINE_SIZES)
			.desc(
				"Resize a cloud workspace: `small` (2 vCPU, 4 GB), `medium` (4 vCPU, 8 GB), `large` (8 vCPU, 16 GB); `xlarge` and `2xlarge` where your plan includes them. A running box restarts at the new size: every terminal and agent on it ends, files survive",
			),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		if (options.taskId !== undefined && options.clearTask) {
			throw new CLIError(
				"Cannot combine --task-id and --clear-task",
				"Pass one or the other",
			);
		}
		if (options.tag?.length && options.clearTags) {
			throw new CLIError(
				"Cannot combine --tag and --clear-tags",
				"Pass one or the other",
			);
		}
		if (
			options.group !== undefined &&
			(options.tag?.length || options.clearTags)
		) {
			throw new CLIError(
				"Cannot combine --group with --tag or --clear-tags",
				"--group already replaces the workspace's tags",
			);
		}

		const taskId = options.clearTask
			? null
			: options.taskId !== undefined
				? options.taskId
				: undefined;

		// --tag replaces the whole set (the host semantic); --clear-tags is [].
		const tags = options.clearTags
			? []
			: options.tag?.length
				? options.tag
				: undefined;

		const cloudOnly = {
			"--machine-size": options.machineSize,
			"--visibility": options.visibility,
			"--add-label": options.addLabel?.length ? options.addLabel : undefined,
			"--remove-label": options.removeLabel?.length
				? options.removeLabel
				: undefined,
		};
		if (
			options.name === undefined &&
			taskId === undefined &&
			tags === undefined &&
			options.group === undefined &&
			Object.values(cloudOnly).every((value) => value === undefined)
		) {
			throw new CLIError(
				"No fields to update",
				"Pass --name, --task-id, --clear-task, --group, --tag, --clear-tags, --machine-size, --visibility, --add-label, or --remove-label",
			);
		}

		const hostId = await resolveWorkspaceHost(
			{ host: options.host, local: options.local },
			ctx.api,
			organizationId,
		);
		if (!hostId) {
			if (options.group !== undefined) {
				throw new CLIError(
					"--group does not apply to a cloud workspace",
					"Pass --tag <tag> to file a cloud workspace, or --local / --host <id> for a workspace on a host",
				);
			}
			const data = await updateCloudWorkspace(ctx.api, id, {
				name: options.name ?? undefined,
				tags,
				task: taskId,
				visibility: options.visibility ?? undefined,
				addLabels: options.addLabel ?? undefined,
				removeLabels: options.removeLabel ?? undefined,
				machineSize: options.machineSize ?? undefined,
			});
			const resize = data.resize as CloudWorkspaceResize | undefined;
			return {
				data,
				message: resize
					? describeResize(id, resize)
					: `Updated cloud workspace ${id}`,
			};
		}
		for (const [flag, value] of Object.entries(cloudOnly)) {
			if (value !== undefined) {
				throw new CLIError(
					`${flag} applies to cloud workspaces only`,
					"Drop --local and --host to target a cloud workspace",
				);
			}
		}

		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});
		const nextTags =
			options.group !== undefined
				? [await groupTagFor(target.client, hostId, id, options.group)]
				: tags;
		const updated = await target.client.workspace.update.mutate({
			id,
			...(options.name !== undefined ? { name: options.name } : {}),
			...(taskId !== undefined ? { taskId } : {}),
			...(nextTags !== undefined ? { tags: nextTags } : {}),
		});

		return {
			data: updated,
			message:
				options.group !== undefined
					? `Updated workspace ${id} and moved it to group "${options.group.trim()}"`
					: `Updated workspace ${id}`,
		};
	},
});

async function groupTagFor(
	client: HostServiceClient,
	hostId: string,
	workspaceId: string,
	group: string,
): Promise<string> {
	const context = await loadGroupContext(client);
	const workspace = context.workspaces.find((row) => row.id === workspaceId);
	if (!workspace) {
		throw new CLIError(
			`Workspace not found on host ${hostId}: ${workspaceId}`,
			"Pass --host <id> if it lives on another machine",
		);
	}
	return claimGroupTag(client, context, {
		name: group,
		scope: tagFolderScope(workspace.projectId),
	});
}
