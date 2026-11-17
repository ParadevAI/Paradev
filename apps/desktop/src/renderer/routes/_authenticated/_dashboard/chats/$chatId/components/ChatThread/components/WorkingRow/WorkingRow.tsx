import { useLingui } from "@lingui/react/macro";
import type { ChatState } from "@superset/chats-core";
import {
	type LiveTurn,
	type LiveTurns,
	toolRunning,
} from "@superset/chats-sync";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";
import { TurnBlocks } from "../../../TurnBlocks";
import { WorkingLine } from "../../../TurnBlocks/components/WorkingLine";

interface WorkingRowProps {
	state: ChatState;
	live: LiveTurns;
	turn: LiveTurn;
	/** A group: the Dev's name and face go with its bubble. */
	isGroup: boolean;
}

/**
 * A Dev at work, at the end of the thread while its turn runs: "Waking up…"
 * while its box starts, then what it thinks and does as it happens. Its
 * reply arrives as a normal message.
 */
export function WorkingRow({ state, live, turn, isGroup }: WorkingRowProps) {
	const { t } = useLingui();
	const name = state.devs[turn.devId]?.name ?? "";
	const blocks = turn.stream.blocks;
	const last = blocks.at(-1);
	const quiet =
		turn.phase === "running" &&
		(!last || (last.kind === "tool" && !toolRunning(last)));
	return (
		<output
			aria-label={t({ message: `${name} is working` })}
			className="flex justify-start px-4 pt-2.5"
		>
			{isGroup && (
				<div className="mr-2 flex w-6 shrink-0 items-end">
					<FaceAvatar seed={turn.devId} size={24} />
				</div>
			)}
			<div className="flex max-w-[70%] min-w-0 flex-col items-start">
				{isGroup && (
					<span className="mb-0.5 px-3.5 text-xs text-muted-foreground">
						{name}
					</span>
				)}
				<div className="flex min-w-0 max-w-full flex-col gap-0.5 rounded-[20px] rounded-bl-md bg-fill-selected px-3.5 py-2 text-sm leading-relaxed">
					{turn.phase === "waking" ? (
						<WorkingLine label={t({ message: "Waking up…" })} />
					) : (
						<>
							<TurnBlocks state={state} live={live} turn={turn} />
							{quiet && (
								<WorkingLine
									label={
										blocks.length
											? t({ message: "Working…" })
											: t({ message: "Thinking…" })
									}
								/>
							)}
						</>
					)}
				</div>
			</div>
		</output>
	);
}
