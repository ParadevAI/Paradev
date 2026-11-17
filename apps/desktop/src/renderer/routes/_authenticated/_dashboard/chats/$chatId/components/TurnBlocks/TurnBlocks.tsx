import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import { type ChatState, chatDevs } from "@superset/chats-core";
import {
	askedDevId,
	type LiveTurn,
	type LiveTurns,
} from "@superset/chats-sync";
import { AskToolItem } from "./components/AskToolItem";
import { CompactionItem } from "./components/CompactionItem";
import { SubagentToolItem } from "./components/SubagentToolItem";
import { ThoughtBlock } from "./components/ThoughtBlock";
import { ToolCallItem } from "./components/ToolCallItem";

interface TurnBlocksProps {
	state: ChatState;
	live: LiveTurns;
	turn: LiveTurn;
}

/**
 * What a Dev did in a turn, in order: its text, its thinking, its tool calls
 * (asks and helpers nested), and where its context was compacted.
 */
export function TurnBlocks({ state, live, turn }: TurnBlocksProps) {
	const chat = state.chats.find((candidate) => candidate.id === turn.groupId);
	const devs = chat ? chatDevs(state, chat) : [];
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			{turn.stream.blocks.map((block, index) => {
				if (block.kind === "text") {
					// biome-ignore lint/suspicious/noArrayIndexKey: blocks only append, so the index is the block's identity
					return <ChatMarkdown key={index}>{block.text}</ChatMarkdown>;
				}
				if (block.kind === "thought") {
					// biome-ignore lint/suspicious/noArrayIndexKey: blocks only append, so the index is the block's identity
					return <ThoughtBlock key={index} text={block.text} />;
				}
				if (block.kind === "compaction") {
					return <CompactionItem key={block.id} block={block} />;
				}
				if (block.subagents) {
					return (
						<SubagentToolItem
							key={block.id}
							state={state}
							live={live}
							parent={turn}
							tool={block}
						/>
					);
				}
				const asked = block.ask ? askedDevId(block.ask, devs) : null;
				if (asked) {
					return (
						<AskToolItem
							key={block.id}
							state={state}
							live={live}
							parent={turn}
							tool={block}
							devId={asked}
						/>
					);
				}
				return <ToolCallItem key={block.id} tool={block} />;
			})}
		</div>
	);
}
