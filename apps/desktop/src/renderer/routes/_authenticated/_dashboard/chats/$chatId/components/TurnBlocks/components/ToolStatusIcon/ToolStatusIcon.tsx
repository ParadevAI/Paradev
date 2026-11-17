import { type ToolBlock, toolRunning } from "@superset/chats-sync";
import { LuCheck, LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";

/** A tool call's state: a spinner while it runs, then a check or a warning. */
export function ToolStatusIcon({ tool }: { tool: ToolBlock }) {
	if (toolRunning(tool)) {
		return <LuLoaderCircle className="size-3 shrink-0 animate-spin" />;
	}
	if (tool.status === "failed") {
		return <LuTriangleAlert className="size-3 shrink-0 text-destructive" />;
	}
	return <LuCheck className="size-3 shrink-0 text-muted-foreground" />;
}
