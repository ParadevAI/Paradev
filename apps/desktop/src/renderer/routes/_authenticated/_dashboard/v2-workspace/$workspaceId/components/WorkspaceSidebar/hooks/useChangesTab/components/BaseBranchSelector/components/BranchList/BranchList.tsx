import { Trans, useLingui } from "@lingui/react/macro";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import type { Branch } from "../../../../types";

interface BranchListProps {
	branches: Branch[];
	currentValue: string;
	onPick: (branchName: string) => void;
}

export function BranchList({
	branches,
	currentValue,
	onPick,
}: BranchListProps) {
	const { t } = useLingui();
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		if (!search) return branches;
		const lower = search.toLowerCase();
		return branches.filter((b) => b.name.toLowerCase().includes(lower));
	}, [branches, search]);

	return (
		<>
			<div className="border-b px-3 py-2">
				<input
					placeholder={t({
						message: "Search branches...",
					})}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
				/>
			</div>
			<ScrollArea className="flex-1 overflow-y-auto">
				<div className="p-1">
					{filtered.map((branch) => (
						<button
							key={branch.name}
							type="button"
							className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
							onClick={() => onPick(branch.name)}
						>
							<span className="truncate">{branch.name}</span>
							{branch.name === currentValue && (
								<Check className="size-3.5 shrink-0" />
							)}
						</button>
					))}
					{filtered.length === 0 && (
						<div className="px-2 py-3 text-center text-sm text-muted-foreground">
							<Trans>No branches found</Trans>
						</div>
					)}
				</div>
			</ScrollArea>
		</>
	);
}
