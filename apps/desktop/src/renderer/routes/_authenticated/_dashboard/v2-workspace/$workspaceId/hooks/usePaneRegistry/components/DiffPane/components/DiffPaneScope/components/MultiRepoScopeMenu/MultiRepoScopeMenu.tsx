import { Plural, Trans } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { changesFilterLabel } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/changesFilterLabel";
import type { MultiRepoScopeKind } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/multiRepoScope";

interface MultiRepoScopeMenuProps {
	kind: MultiRepoScopeKind;
	onKindChange: (kind: MultiRepoScopeKind) => void;
	/** Uncommitted files across the shown repositories. */
	uncommittedCount: number;
}

/** The scope menu for several repositories: only the scopes every repository can share. */
export function MultiRepoScopeMenu({
	kind,
	onKindChange,
	uncommittedCount,
}: MultiRepoScopeMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex min-w-0 items-center gap-1 overflow-hidden rounded px-1.5 py-0.5 font-medium text-xs hover:bg-accent"
				>
					<span className="truncate">{changesFilterLabel({ kind }, [])}</span>
					<ChevronDown className="size-3 shrink-0 text-muted-foreground" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				<DropdownMenuItem onSelect={() => onKindChange("all")}>
					<div className="flex flex-1 items-center justify-between">
						<span>
							<Trans>All commits</Trans>
						</span>
						{kind === "all" && <Check className="size-3.5" />}
					</div>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => onKindChange("uncommitted")}>
					<div className="flex flex-1 items-center justify-between">
						<div>
							<div>
								<Trans>Uncommitted changes</Trans>
							</div>
							<div className="text-[10px] text-muted-foreground">
								<Plural
									value={uncommittedCount}
									one="# file changed"
									other="# files changed"
								/>
							</div>
						</div>
						{kind === "uncommitted" && <Check className="size-3.5" />}
					</div>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
