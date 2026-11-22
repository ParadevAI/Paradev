export function RemoteScene() {
	return (
		<span className="mb-3 flex items-end gap-1.5">
			<span className="flex flex-col items-center">
				<span className="flex h-[32px] w-[46px] flex-col gap-[3px] rounded-[4px] border border-border bg-background p-1.5 shadow-sm">
					<span className="h-[3px] w-4/5 rounded-full bg-muted-foreground/40" />
					<span className="h-[3px] w-3/5 rounded-full bg-muted-foreground/20" />
					<span className="h-[3px] w-2/3 rounded-full bg-muted-foreground/20" />
				</span>
				<span className="h-[3px] w-[56px] rounded-b-[3px] bg-border" />
			</span>
			<span className="mb-[15px] flex items-center gap-1">
				<span className="w-2.5 border-t border-dashed border-muted-foreground/50" />
				<span className="size-1.5 rounded-full bg-highlight" />
				<span className="w-2.5 border-t border-dashed border-muted-foreground/50" />
			</span>
			<span className="flex h-[26px] w-[38px] flex-col justify-center gap-[5px] rounded-md border border-border bg-background px-1.5 shadow-sm">
				<span className="flex items-center gap-1">
					<span className="size-1 shrink-0 rounded-full bg-success" />
					<span className="h-[3px] flex-1 rounded-full bg-muted-foreground/30" />
				</span>
				<span className="flex items-center gap-1">
					<span className="size-1 shrink-0 rounded-full bg-success" />
					<span className="h-[3px] flex-1 rounded-full bg-muted-foreground/30" />
				</span>
			</span>
		</span>
	);
}
