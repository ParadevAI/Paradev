import { Trans, useLingui } from "@lingui/react/macro";
import type { ChatState } from "@superset/chats-core";
import {
	type LiveTurn,
	type LiveTurns,
	nestedTurn,
	type ToolBlock,
	toolRunning,
} from "@superset/chats-sync";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";
import { TurnBlocks } from "../../TurnBlocks";
import { ToolStatusIcon } from "../ToolStatusIcon";
import { WorkingLine } from "../WorkingLine";

interface AskToolItemProps {
	state: ChatState;
	live: LiveTurns;
	/** The asking Dev's turn. */
	parent: LiveTurn;
	tool: ToolBlock;
	devId: string;
}

/**
 * One Dev asking another: the asked Dev's own turn streamed inside when the
 * person may watch it, else the answer the asking Dev got back.
 */
export function AskToolItem({
	state,
	live,
	parent,
	tool,
	devId,
}: AskToolItemProps) {
	const { t } = useLingui();
	const asked = state.devs[devId];
	const name = asked?.name ?? t({ message: "another Dev" });
	const nested = nestedTurn(live, parent, devId);
	const running = toolRunning(tool);
	const streamed = !!nested && nested.stream.blocks.length > 0;
	return (
		<div className="my-1 flex flex-col gap-1">
			<div className="flex items-center gap-2 text-[13px] text-muted-foreground">
				{asked && <FaceAvatar seed={asked.id} size={16} />}
				<span>
					{running ? (
						<Trans>
							Asking <span className="font-medium text-foreground">{name}</span>
						</Trans>
					) : (
						<Trans>
							Asked <span className="font-medium text-foreground">{name}</span>
						</Trans>
					)}
				</span>
				<ToolStatusIcon tool={tool} />
			</div>
			<div className="ml-2 flex flex-col gap-1 border-border border-l-2 pl-3">
				{streamed && nested ? (
					<TurnBlocks state={state} live={live} turn={nested} />
				) : running ? (
					<WorkingLine
						label={
							nested?.phase === "waking"
								? t({ message: `${name} is waking up…` })
								: t({ message: `Waiting for ${name}…` })
						}
					/>
				) : null}
				{!running && tool.output && (tool.status === "failed" || !streamed) && (
					<p
						className={
							tool.status === "failed"
								? "text-destructive text-sm"
								: "whitespace-pre-wrap text-muted-foreground text-sm"
						}
					>
						{tool.status === "failed"
							? tool.output
							: t({ message: `Answer: ${tool.output}` })}
					</p>
				)}
			</div>
		</div>
	);
}
