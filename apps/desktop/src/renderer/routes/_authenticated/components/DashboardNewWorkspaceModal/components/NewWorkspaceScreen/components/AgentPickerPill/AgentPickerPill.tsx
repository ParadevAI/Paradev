import { useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { AtSign } from "lucide-react";
import { LuCheck, LuChevronDown } from "react-icons/lu";
import { AgentIcon } from "renderer/components/AgentIcon";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import {
	MENU_PANEL_CLASS,
	MENU_ROW_CLASS,
	PILL_CHEVRON_CLASS,
	PILL_TRIGGER_CLASS,
} from "renderer/routes/_authenticated/components/AgentComposer/constants";

interface AgentPickerPillProps<TAgentId extends string> {
	agents: readonly (AgentSelectAgent & { id: TAgentId })[];
	selectedAgentId: TAgentId | "none";
	onSelect: (agentId: TAgentId) => void;
}

/** Which agent the new thread starts with. */
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
				<button type="button" className={cn(PILL_TRIGGER_CLASS, "group")}>
					{selected ? (
						<AgentIcon
							iconId={selected.iconId}
							presetId={selected.presetId ?? selected.id}
							className="size-3.5"
						/>
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
						<AgentIcon
							iconId={agent.iconId}
							presetId={agent.presetId ?? agent.id}
							className="size-4"
						/>
						<span className="min-w-0 flex-1 truncate">{agent.label}</span>
						{agent.id === selectedAgentId && (
							<LuCheck className="size-3.5 shrink-0" />
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
