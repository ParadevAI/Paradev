const CREATE_COMMAND = "superset ws create";

export function CliScene() {
	return (
		<span className="mb-2.5 flex w-[124px] flex-col overflow-hidden rounded-md border border-border bg-background shadow-sm">
			<span className="flex h-3 items-center gap-[3px] border-b border-border px-1.5">
				<span className="size-[4px] rounded-full bg-muted-foreground/35" />
				<span className="size-[4px] rounded-full bg-muted-foreground/35" />
				<span className="size-[4px] rounded-full bg-muted-foreground/35" />
			</span>
			<span className="flex flex-col gap-1 whitespace-nowrap px-1.5 py-2 font-mono text-[9px] leading-none text-foreground">
				<span>
					<span className="text-muted-foreground">$ </span>
					{CREATE_COMMAND}
				</span>
				<span className="flex items-center text-muted-foreground">
					$&nbsp;
					<span className="h-[9px] w-[5px] rounded-[1px] bg-highlight" />
				</span>
			</span>
		</span>
	);
}
