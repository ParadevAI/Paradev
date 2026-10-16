import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import type { CardBlockViewProps } from "../../types";
import { CardActions } from "../CardActions";
import { SupersetWorkspace, useOpenWorkspace } from "../SupersetWorkspace";

const INPUT_REQUIRED = ["send_back"];

/** An agent's turn is over: its workspace as the sidebar draws it, what changed on the PR, and the way back to it. */
export function AgentFinishedBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"superset.agent_finished">) {
	const openWorkspace = useOpenWorkspace();
	return (
		<div className="flex flex-col">
			<SupersetWorkspace workspace={view.workspace} detail />
			{!done && (
				<CardActions
					actions={actions}
					pending={pending}
					failure={failure}
					onAct={onAct}
					inputRequired={INPUT_REQUIRED}
					leading={
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => openWorkspace(view.workspace)}
						>
							<Trans>Open workspace</Trans>
						</Button>
					}
				/>
			)}
		</div>
	);
}
