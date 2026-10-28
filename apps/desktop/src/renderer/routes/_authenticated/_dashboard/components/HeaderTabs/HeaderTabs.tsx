import { cn } from "@superset/ui/utils";

interface HeaderTabsProps<T extends string> {
	tabs: { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
}

export function HeaderTabs<T extends string>({
	tabs,
	value,
	onChange,
}: HeaderTabsProps<T>) {
	return (
		<div className="flex items-center gap-0.5">
			{tabs.map((entry) => (
				<button
					key={entry.value}
					type="button"
					onClick={() => onChange(entry.value)}
					className={cn(
						"h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
						value === entry.value
							? "bg-fill-selected text-foreground"
							: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
					)}
				>
					{entry.label}
				</button>
			))}
		</div>
	);
}
