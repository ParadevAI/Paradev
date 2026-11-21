export function MobileScene() {
	return (
		<span className="flex h-[66px] w-[50px] translate-y-3 flex-col items-center gap-[5px] rounded-[11px] border border-border bg-background px-1.5 pt-1.5 shadow-sm">
			<span className="h-1 w-3.5 rounded-full bg-muted" />
			<span className="flex w-full flex-col gap-[3px]">
				<span className="h-2 w-7 rounded-full bg-muted" />
				<span className="h-2 w-5 rounded-full bg-muted" />
				<span className="h-2 w-6 self-end rounded-full bg-highlight" />
			</span>
		</span>
	);
}
