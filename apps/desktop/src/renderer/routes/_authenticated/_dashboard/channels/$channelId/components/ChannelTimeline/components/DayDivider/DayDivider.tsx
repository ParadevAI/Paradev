import { formatDate } from "@superset/i18n/format";

export function DayDivider({ date }: { date: Date }) {
	return (
		<div className="relative my-2 flex items-center px-4">
			<div className="h-px flex-1 bg-border" />
			<span className="mx-3 text-[11px] font-medium text-muted-foreground">
				{formatDate(date, { weekday: "long", month: "long", day: "numeric" })}
			</span>
			<div className="h-px flex-1 bg-border" />
		</div>
	);
}
