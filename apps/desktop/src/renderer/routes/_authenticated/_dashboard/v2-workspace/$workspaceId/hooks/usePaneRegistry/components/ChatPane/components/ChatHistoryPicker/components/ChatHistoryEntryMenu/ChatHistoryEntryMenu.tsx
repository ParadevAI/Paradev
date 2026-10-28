import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Download, Ellipsis, Pencil } from "lucide-react";

export function ChatHistoryEntryMenu({
	onRename,
	onExport,
}: {
	onRename: () => void;
	onExport: () => void;
}) {
	const { t } = useLingui();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="mr-1 size-6 shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
					aria-label={t({ message: "Chat actions" })}
				>
					<Ellipsis className="size-3.5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onSelect={onRename}>
					<Pencil className="size-4" />
					<Trans>Rename chat…</Trans>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={onExport}>
					<Download className="size-4" />
					<Trans>Export chat…</Trans>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
