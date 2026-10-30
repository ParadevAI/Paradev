import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Branch } from "../../types";
import { BranchList } from "./components/BranchList";

interface BaseBranchSelectorProps {
	branches: Branch[];
	currentValue: string;
	onChange: (branchName: string) => void;
}

export function BaseBranchSelector({
	branches,
	currentValue,
	onChange,
}: BaseBranchSelectorProps) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				{/* Same chip as the commit-filter trigger beside it, so "vs" sits
				    between two equal paddings instead of hugging the branch. */}
				<button
					type="button"
					className="flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium text-foreground text-xs hover:bg-accent"
				>
					<span className="min-w-0 truncate" title={currentValue}>
						{currentValue}
					</span>
					<ChevronDown className="size-3 shrink-0 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="flex w-64 max-h-96 flex-col p-0 overflow-hidden"
				align="start"
			>
				<BranchList
					branches={branches}
					currentValue={currentValue}
					onPick={(branchName) => {
						onChange(branchName);
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
