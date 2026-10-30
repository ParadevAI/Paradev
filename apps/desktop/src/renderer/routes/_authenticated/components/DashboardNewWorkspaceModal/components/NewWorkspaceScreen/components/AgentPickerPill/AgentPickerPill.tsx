import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { AtSign, BotOff } from "lucide-react";
import { LuCheck, LuChevronDown } from "react-icons/lu";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import {
	MENU_PANEL_CLASS,
	MENU_ROW_CLASS,
	PILL_CHEVRON_CLASS,
	PILL_TRIGGER_CLASS,
} from "renderer/routes/_authenticated/components/AgentComposer/constants";
import { AgentIcon } from "./components/AgentIcon";

interface AgentPickerPillProps<TAgentId extends string> {
	agents: readonly (AgentSelectAgent & { id: TAgentId })[];
	selectedAgentId: TAgentId | "none";
	onSelect: (agentId: TAgentId | "none") => void;
}

/** Which agent the new thread starts with, or none for a bare workspace. */
export function AgentPickerPill<TAgentId extends string>({
	agents,
	selectedAgentId,
	onSelect,
}: AgentPickerPillProps<TAgentId>) {
	const { t } = useLingui();
	const selected = agents.find((agent) => agent.id === selectedAgentId);
	if (agents.length === 0) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label={t({ message: "Agent" })}
					className={cn(PILL_TRIGGER_CLASS, "group")}
				>
					{selected ? (
						<AgentIcon agent={selected} className="size-3.5" />
					) : (
						<AtSign className="size-3.5 shrink-0" />
					)}
					<span className="truncate">
						{selected?.label ?? t({ message: "Bring in an agent" })}
					</span>
					<LuChevronDown className={PILL_CHEVRON_CLASS} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				side="top"
				className={cn(MENU_PANEL_CLASS, "w-[240px] p-1.5")}
			>
				{agents.map((agent) => (
					<DropdownMenuItem
						key={agent.id}
						className={MENU_ROW_CLASS}
						onSelect={() => onSelect(agent.id)}
					>
						<AgentIcon agent={agent} className="size-4" />
						<span className="min-w-0 flex-1 truncate">{agent.label}</span>
						{agent.id === selectedAgentId && (
							<LuCheck className="size-3.5 shrink-0" />
						)}
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className={MENU_ROW_CLASS}
					onSelect={() => onSelect("none")}
				>
					<BotOff className="size-4 shrink-0" />
					<span className="min-w-0 flex-1 truncate">
						<Trans>No agent</Trans>
					</span>
					{selectedAgentId === "none" && (
						<LuCheck className="size-3.5 shrink-0" />
					)}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
