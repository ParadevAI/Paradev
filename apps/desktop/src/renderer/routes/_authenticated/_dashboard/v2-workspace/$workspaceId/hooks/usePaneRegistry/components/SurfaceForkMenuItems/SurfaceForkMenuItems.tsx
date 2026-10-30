import { Trans } from "@lingui/react/macro";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { MessageSquare, SquareStack, SquareTerminal } from "lucide-react";
import type {
	SurfaceForkPlacement,
	SurfaceForkSource,
} from "../../hooks/useSurfaceFork";

export function SurfaceForkMenuItems({
	target,
	source,
	onFork,
}: {
	target: "cli" | "chat";
	source: SurfaceForkSource;
	onFork: (source: SurfaceForkSource, placement: SurfaceForkPlacement) => void;
}) {
	const TargetIcon = target === "chat" ? MessageSquare : SquareTerminal;
	return (
		<>
			<DropdownMenuItem
				className="items-start"
				onSelect={() => onFork(source, "beside")}
			>
				<TargetIcon className="mt-0.5" />
				<div className="flex flex-col gap-0.5">
					<span>
						{target === "chat" ? (
							<Trans>Fork into chat</Trans>
						) : (
							<Trans>Fork into CLI</Trans>
						)}
					</span>
					<span className="text-[11px] text-muted-foreground">
						<Trans>Opens beside this pane. This one keeps running.</Trans>
					</span>
				</div>
			</DropdownMenuItem>
			<DropdownMenuItem onSelect={() => onFork(source, "tab")}>
				<SquareStack />
				{target === "chat" ? (
					<Trans>Fork into chat in a new tab</Trans>
				) : (
					<Trans>Fork into CLI in a new tab</Trans>
				)}
			</DropdownMenuItem>
		</>
	);
}
