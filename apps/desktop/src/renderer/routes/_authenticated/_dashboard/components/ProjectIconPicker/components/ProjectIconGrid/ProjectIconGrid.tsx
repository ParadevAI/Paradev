import { cn } from "@superset/ui/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	type ComponentType,
	type MouseEvent,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

const MAX_COLUMNS = 12;
const COLUMN_WIDTH = 34;
const ROW_HEIGHT = 34;
const OVERSCAN = 4;

interface ProjectIconGridProps {
	names: string[];
	icons: Record<string, ComponentType<{ className?: string; style?: object }>>;
	selected: string | null;
	color: string | null;
	onPick: (name: string, event: MouseEvent<HTMLButtonElement>) => void;
}

export function ProjectIconGrid({
	names,
	icons,
	selected,
	color,
	onPick,
}: ProjectIconGridProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [columns, setColumns] = useState(MAX_COLUMNS);
	useLayoutEffect(() => {
		const element = scrollRef.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			setColumns(
				Math.max(
					1,
					Math.min(
						MAX_COLUMNS,
						Math.floor((entry.contentRect.width + 2) / COLUMN_WIDTH),
					),
				),
			);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	const rowCount = Math.ceil(names.length / columns);
	const virtualizer = useVirtualizer({
		count: rowCount,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: OVERSCAN,
	});

	return (
		<div ref={scrollRef} className="min-h-0 max-h-[320px] overflow-y-auto p-2">
			<div
				className="relative w-full"
				style={{ height: virtualizer.getTotalSize() }}
			>
				{virtualizer.getVirtualItems().map((row) => (
					<div
						key={row.key}
						className="absolute inset-x-0 grid gap-0.5"
						style={{
							top: row.start,
							height: ROW_HEIGHT,
							gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
						}}
					>
						{names
							.slice(row.index * columns, (row.index + 1) * columns)
							.map((name) => {
								const Icon = icons[name];
								if (!Icon) return null;
								return (
									<button
										key={name}
										type="button"
										aria-label={name.replace(/-/g, " ")}
										onClick={(event) => onPick(name, event)}
										className={cn(
											"flex size-8 items-center justify-center rounded-md hover:bg-fill-hover",
											name === selected && "bg-fill-selected",
										)}
									>
										<Icon
											className={cn(
												"size-5",
												!color && "text-muted-foreground",
											)}
											style={color ? { color } : undefined}
										/>
									</button>
								);
							})}
					</div>
				))}
			</div>
		</div>
	);
}
