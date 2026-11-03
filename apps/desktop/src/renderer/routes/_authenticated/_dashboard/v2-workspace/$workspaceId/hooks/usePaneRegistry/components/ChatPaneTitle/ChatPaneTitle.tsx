import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import {
	type SubagentCrumb,
	useChatSubagentStore,
} from "../../stores/chatSubagentStore";
import { SubagentBreadcrumb } from "./components/SubagentBreadcrumb";

const NO_PATH: readonly SubagentCrumb[] = [];

export function ChatPaneTitle({
	chatKey,
	icon,
	isActive,
	title,
}: {
	chatKey: string;
	icon: ReactNode;
	isActive: boolean;
	title: string;
}) {
	const path = useChatSubagentStore((state) => state.paths[chatKey] ?? NO_PATH);
	const open = useChatSubagentStore((state) => state.open);
	return (
		<>
			<span className="shrink-0 text-muted-foreground">{icon}</span>
			{path.length > 0 ? (
				<SubagentBreadcrumb
					onSelect={(id) => open(chatKey, id)}
					path={path}
					root={title}
				/>
			) : (
				<span
					className={cn(
						"truncate text-xs transition-colors duration-150",
						isActive ? "text-foreground" : "text-muted-foreground",
					)}
					title={title}
				>
					{title}
				</span>
			)}
		</>
	);
}
