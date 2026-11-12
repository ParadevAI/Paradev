const CLOUD_PATH =
	"M18 46C9.7 46 4 40.3 4 33.3 4 26.6 9.4 21.2 16 21 17.2 12.4 24.4 6 33 6c7.7 0 14.2 5 16.4 12 1.5-.3 3-.4 4.6-.2C62 18.6 68.5 25 68.5 33c0 7.2-5.6 13-12.7 13Z";

export function CloudScene() {
	return (
		<span className="relative mb-1.5 flex h-[60px] w-[110px] justify-center">
			<svg
				aria-hidden="true"
				viewBox="0 0 73 50"
				className="absolute top-0 h-[48px] fill-background stroke-border"
				strokeWidth={1}
			>
				<path d={CLOUD_PATH} />
			</svg>
			<span className="absolute bottom-0 flex w-[78px] items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-1 shadow-sm">
				<span className="size-1.5 shrink-0 rounded-full bg-success" />
				<span className="flex flex-1 flex-col gap-[3px]">
					<span className="h-[3px] w-4/5 rounded-full bg-muted-foreground/40" />
					<span className="h-[3px] w-1/2 rounded-full bg-muted-foreground/20" />
				</span>
			</span>
		</span>
	);
}
