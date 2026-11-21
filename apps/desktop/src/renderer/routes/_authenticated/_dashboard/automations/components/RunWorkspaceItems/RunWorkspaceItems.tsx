import { Trans } from "@lingui/react/macro";
import { CommandItem } from "@superset/ui/command";
import { HiCheck } from "react-icons/hi2";
import { LuPlus, LuRepeat } from "react-icons/lu";

interface RunWorkspaceItemsProps {
	/** Project-less automations call their workspaces sessions. */
	sessions: boolean;
	mode: "new" | "same" | "picked";
	/** The workspace "Same workspace" currently reuses, once a run made it. */
	keptName: string | null;
	onSelect: (mode: "new" | "same") => void;
}

export function RunWorkspaceItems({
	sessions,
	mode,
	keptName,
	onSelect,
}: RunWorkspaceItemsProps) {
	return (
		<>
			<CommandItem value="__new__" onSelect={() => onSelect("new")}>
				<LuPlus className="size-4" />
				<span className="flex min-w-0 flex-col">
					<span>
						{sessions ? (
							<Trans>New session</Trans>
						) : (
							<Trans>New workspace</Trans>
						)}
					</span>
					<span className="truncate text-[10px] text-muted-foreground">
						<Trans>Each run makes its own</Trans>
					</span>
				</span>
				{mode === "new" && <HiCheck className="ml-auto size-4" />}
			</CommandItem>
			<CommandItem value="__same__" onSelect={() => onSelect("same")}>
				<LuRepeat className="size-4" />
				<span className="flex min-w-0 flex-col">
					<span>
						{sessions ? (
							<Trans>Same session</Trans>
						) : (
							<Trans>Same workspace</Trans>
						)}
					</span>
					<span className="truncate text-[10px] text-muted-foreground">
						{keptName ? (
							<Trans>Reusing {keptName}</Trans>
						) : (
							<Trans>The first run makes one, later runs reuse it</Trans>
						)}
					</span>
				</span>
				{mode === "same" && <HiCheck className="ml-auto size-4" />}
			</CommandItem>
		</>
	);
}
