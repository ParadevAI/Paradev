import { LuFolder } from "react-icons/lu";

interface HiddenTrailProps {
	folders: readonly string[];
	onPick: (index: number) => void;
}

export function HiddenTrail({ folders, onPick }: HiddenTrailProps) {
	return (
		<div className="max-h-80 w-56 overflow-y-auto p-1">
			{folders.map((folder, index) => (
				<button
					key={`${index}:${folder}`}
					type="button"
					style={{ paddingLeft: `${index * 12 + 6}px` }}
					onClick={() => onPick(index)}
					className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-sm pr-2 text-left text-xs hover:bg-accent"
				>
					<LuFolder className="size-3.5 shrink-0 text-muted-foreground" />
					<span className="truncate">{folder}</span>
				</button>
			))}
		</div>
	);
}
