import { CLIError, string } from "@superset/cli-framework";
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
		resumeSession: string().desc(
			"Native harness session ID of a previous run to restore into a new chat session",
		),
		continueSession: string().desc(
			"Try to continue this live chat; otherwise start a new chat",
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
		if (options.resumeSession && options.continueSession) {
			throw new CLIError(
				"Choose one session operation",
				"Pass either --resume-session or --continue-session, not both",
			);
		}

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
			resumeSessionId: options.resumeSession,
			continueSessionId: options.continueSession,
			attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
		});

		return {
			data: result,
			message:
				options.continueSession && result.sessionId !== options.continueSession
					? `Previous chat could not be continued. Started a new ${result.label} chat session ${result.sessionId} in workspace ${options.workspace}`
					: `Started ${result.label} chat session ${result.sessionId} in workspace ${options.workspace}`,
		};
	},
});
