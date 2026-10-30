import { cn } from "@superset/ui/utils";
import { Bot } from "lucide-react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";

export function AgentIcon({
	agent,
	className,
}: {
	agent: AgentSelectAgent;
	className: string;
}) {
	const isDark = useIsDarkTheme();
	const icon = getPresetIcon(
		agent.iconId ?? agent.presetId ?? agent.id,
		isDark,
	);
	return icon ? (
		<img
			alt=""
			className={cn("shrink-0 object-contain", className)}
			draggable={false}
			src={icon}
		/>
	) : (
		<Bot className={cn("shrink-0", className)} />
	);
}
