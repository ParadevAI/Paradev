import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	resolveSessionWorkspace,
	sessionWorkspaceOptions,
} from "../../../lib/sessions";
import { uploadAttachments } from "../../../lib/upload-attachments";

export default command({
	description: "Create a chat agent session in an existing workspace",
	options: {
		...sessionWorkspaceOptions,
		agent: string()
			.required()
			.desc(
				"Chat-capable agent preset id (e.g. `claude`, `codex`) or HostAgentConfig instance UUID",
			),
		prompt: string().desc("Initial prompt sent to the chat session"),
		model: string().desc(
			"Model for this launch (agent-specific; omit to use the agent default)",
		),
		mode: string().desc(
			"Launch mode for this chat session (agent-specific; omit to use the agent default)",
		),
		attachmentId: string()
			.variadic()
			.desc("Pre-uploaded attachment UUID; pass --attachment-id repeatedly"),
		attachment: string()
			.variadic()
			.desc(
				"Local file path to upload as an attachment to the host. Repeatable",
			),
	},
	run: async ({ ctx, options }) => {
		const { target, sessions } = await resolveSessionWorkspace(ctx, options);

		const uploadedIds = options.attachment
			? await uploadAttachments(target.client, options.attachment)
			: [];
		const attachmentIds = [...(options.attachmentId ?? []), ...uploadedIds];

		const result = await sessions.create.mutate({
			workspaceId: options.workspace,
			agent: options.agent,
			prompt: options.prompt,
			model: options.model,
			mode: options.mode,
			attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
		});

		return {
			data: result,
			message: `Started ${result.label} chat session ${result.sessionId} in workspace ${options.workspace}`,
		};
	},
});
