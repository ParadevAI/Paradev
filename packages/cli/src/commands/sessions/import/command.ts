import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	resolveSessionWorkspace,
	sessionWorkspaceOptions,
} from "../../../lib/sessions";

export default command({
	description:
		"Adopt a session the agent started outside Superset into a new chat session",
	options: {
		...sessionWorkspaceOptions,
		agent: string()
			.required()
			.desc(
				"Chat-capable agent preset id (e.g. `claude`, `codex`) or HostAgentConfig instance UUID",
			),
		nativeSession: string()
			.required()
			.desc("The agent's own session ID (e.g. from `claude --resume`)"),
	},
	run: async ({ ctx, options }) => {
		const { sessions } = await resolveSessionWorkspace(ctx, options);

		const result = await sessions.create.mutate({
			workspaceId: options.workspace,
			agent: options.agent,
			resumeSessionId: options.nativeSession,
		});

		return {
			data: result,
			message: `Imported ${result.label} session ${options.nativeSession} as chat session ${result.sessionId} in workspace ${options.workspace}`,
		};
	},
});
