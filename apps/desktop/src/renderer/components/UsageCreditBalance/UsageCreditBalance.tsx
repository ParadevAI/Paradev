import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import {
	type CreditBalanceInput,
	creditBalanceReading,
	formatCreditBalance,
} from "shared/usage-credits";

export function UsageCreditBalance({
	account,
	offline = false,
}: {
	account: CreditBalanceInput;
	offline?: boolean;
}) {
	const { i18n } = useLingui();
	const balance = creditBalanceReading(account, offline);
	if (!balance) return null;
	const value = formatCreditBalance(balance, i18n.locale);
	return (
		<p
			className="usage-credit-balance flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs"
			data-stale={!balance.fresh}
			title={formatRelativeTime(balance.checkedAt)}
		>
			<span className="text-muted-foreground">
				{balance.kind === "prepaid" ? (
					<Trans>Prepaid balance</Trans>
				) : (
					<Trans>Credits</Trans>
				)}
			</span>
			<span className="font-medium tabular-nums">
				{!balance.fresh && "~"}
				{value}
			</span>
		</p>
	);
}
