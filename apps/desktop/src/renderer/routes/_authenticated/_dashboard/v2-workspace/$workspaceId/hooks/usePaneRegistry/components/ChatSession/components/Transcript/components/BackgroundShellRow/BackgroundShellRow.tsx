import { useLingui } from "@lingui/react/macro";
import type { ToolCall } from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import { Square, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { useNestedItems } from "../../providers/NestedItemsProvider";
import { backgroundShell } from "../../utils/backgroundShell";
import { RunStatus } from "../RunStatus";

export function BackgroundShellRow({ item }: { item: ToolCall }) {
	const { t } = useLingui();
	const { liveTasks, stopTask } = useNestedItems();
	const [stopping, setStopping] = useState(false);
	const shell = backgroundShell(item, liveTasks ?? null);
	const { taskId, command: name } = shell;
	const canStop =
		shell.status === "running" && shell.canStop && taskId && stopTask;
	return (
		<div
			className="group/run flex min-w-0 items-center gap-1.5 py-1 font-sans text-sm"
			data-background-shell={item.id}
			data-run-phase={shell.status}
		>
			<SquareTerminal
				className={cn(
					"size-3.5 shrink-0",
					shell.status === "failed"
						? "text-destructive/80"
						: "text-muted-foreground",
				)}
			/>
			<span
				className="min-w-0 shrink truncate font-mono text-[12px] text-foreground/70"
				data-find-item={item.id}
				title={shell.command}
			>
				{shell.command}
			</span>
			<RunStatus
				endedAtMs={shell.endedAtMs}
				exitCode={shell.exitCode}
				startedAtMs={shell.startedAtMs}
				status={shell.status}
			/>
			{canStop && (
				<button
					aria-label={t({ message: `Stop ${name}` })}
					className="flex size-5 shrink-0 items-center justify-center rounded text-foreground/45 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
					disabled={stopping}
					onClick={() => {
						setStopping(true);
						void stopTask(taskId).finally(() => setStopping(false));
					}}
					title={t({ message: "Stop" })}
					type="button"
				>
					<Square className="size-2.5 fill-current" />
				</button>
			)}
		</div>
	);
}
