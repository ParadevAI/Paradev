import { Trans } from "@lingui/react/macro";

export function DevBadge() {
	return (
		<span className="shrink-0 rounded-[4px] bg-muted px-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
			<Trans>Dev</Trans>
		</span>
	);
}
