import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";

const DAY_MS = 24 * 60 * 60_000;

export function DayDivider({ at }: { at: number }) {
	const { formatDateTime } = useFormat();
	const day = new Date(at).toDateString();
	const label =
		day === new Date().toDateString() ? (
			<Trans>Today</Trans>
		) : day === new Date(Date.now() - DAY_MS).toDateString() ? (
			<Trans>Yesterday</Trans>
		) : (
			formatDateTime(new Date(at), {
				weekday: "long",
				month: "long",
				day: "numeric",
			})
		);
	return (
		<div className="-ml-10 flex items-center gap-3 pt-5 pb-1">
			<span className="h-px flex-1 bg-border" />
			<span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
				{label}
			</span>
			<span className="h-px flex-1 bg-border" />
		</div>
	);
}
