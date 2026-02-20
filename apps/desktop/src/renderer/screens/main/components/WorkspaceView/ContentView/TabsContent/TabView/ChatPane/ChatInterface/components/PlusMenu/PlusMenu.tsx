import { usePromptInputAttachments } from "@superset/ui/ai-elements/prompt-input";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { HiMiniPaperClip } from "react-icons/hi2";
import { LuLink, LuPlus } from "react-icons/lu";

interface PlusMenuProps {
	onLinkIssue: () => void;
}

export function PlusMenu({ onLinkIssue }: PlusMenuProps) {
	const attachments = usePromptInputAttachments();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
				>
					<LuPlus className="size-4" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="end" className="w-52">
				<DropdownMenuItem onSelect={() => attachments.openFileDialog()}>
					<HiMiniPaperClip className="size-4" />
					Add attachment
					<DropdownMenuShortcut>⌘U</DropdownMenuShortcut>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={onLinkIssue}>
					<LuLink className="size-4" />
					Link issue
					<DropdownMenuShortcut>⌘I</DropdownMenuShortcut>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
