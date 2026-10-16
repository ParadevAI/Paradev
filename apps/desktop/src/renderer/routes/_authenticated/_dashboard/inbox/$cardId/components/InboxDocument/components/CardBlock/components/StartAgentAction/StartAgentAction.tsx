import { Button } from "@superset/ui/button";
import type { ComponentType, ReactNode } from "react";
import type { RunnableTask } from "renderer/routes/_authenticated/_dashboard/tasks/components/RunInWorkspacePopoverV2";
import type { AgentFixView, CardAction } from "../../types";

export interface StartAgentProps {
	tasks: RunnableTask[];
	onComplete: () => void;
	onCreated?: (workspaceIds: string[]) => void;
	trigger: ReactNode;
	align?: "start" | "end";
}

interface StartAgentActionProps {
	/** The card's `started` action; absent draws nothing. */
	action: CardAction | undefined;
	/** Names the task among the app's tasks. */
	id: string;
	fix: AgentFixView;
	pending: boolean;
	/** The task list's "run in a workspace" popover, which needs the app's hosts and projects around it. */
	StartAgent: ComponentType<StartAgentProps>;
	onStarted: (workspace: string) => void;
}

/** The button that starts an agent on what a card is about, and tells the card the workspace it made. */
export function StartAgentAction({
	action,
	id,
	fix,
	pending,
	StartAgent,
	onStarted,
}: StartAgentActionProps) {
	if (!action) return null;
	return (
		<StartAgent
			tasks={[
				{
					id,
					slug: fix.slug,
					title: fix.title,
					description: fix.prompt,
					branch: null,
					linked: false,
				},
			]}
			align="end"
			onComplete={() => {}}
			onCreated={([workspace]) => workspace && onStarted(workspace)}
			trigger={
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={pending || Boolean(action.disabled)}
				>
					{action.label}
				</Button>
			}
		/>
	);
}
