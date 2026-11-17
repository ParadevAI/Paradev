import { Trans, useLingui } from "@lingui/react/macro";
import type { ToolCall } from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import { ArrowDownToLine, Square } from "lucide-react";
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
			className="flex min-w-0 items-center gap-1.5 py-1 font-sans text-sm"
			data-background-shell={item.id}
			data-run-phase={shell.status}
		>
			<ArrowDownToLine
				aria-hidden="true"
				className="size-3.5 shrink-0 text-muted-foreground"
			/>
			<span
				className="min-w-0 truncate text-muted-foreground"
				data-find-item={item.id}
				title={shell.command}
			>
				{shell.command}
			</span>
			<span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
				<RunStatus
					className={cn(shell.status !== "failed" && "text-muted-foreground")}
					endedAtMs={shell.endedAtMs}
					exitCode={shell.exitCode}
					startedAtMs={shell.startedAtMs}
					status={shell.status}
				/>
				{canStop && (
					<button
						aria-label={t({ message: `Stop ${name}` })}
						className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-foreground/80 text-xs transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
						disabled={stopping}
						onClick={() => {
							setStopping(true);
							void stopTask(taskId).finally(() => setStopping(false));
						}}
						type="button"
					>
						<Square className="size-2.5 fill-current" />
						<Trans>Stop</Trans>
					</button>
				)}
			</span>
		</div>
	);
}
