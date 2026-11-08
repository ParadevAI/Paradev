import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/use-format";
import type { ShareSeatCost } from "../../../../types";

interface InviteFooterProps {
	organizationName: string;
	/** Staged emails of people not yet in the organization. */
	newPeople: number;
	/** Set on paid plans. `null` when the seat price is unknown. */
	seatCost?: ShareSeatCost | null;
}

export function InviteFooter({
	organizationName,
	newPeople,
	seatCost,
}: InviteFooterProps) {
	const { t } = useLingui();
	const { formatCurrency } = useFormat();
	if (!newPeople) return null;

	if (seatCost === undefined) {
		return (
			<p className="-mx-3 border-t px-3 py-2 text-muted-foreground text-xs">
				<Trans>
					New people get an email invite to {organizationName}. They see this
					once they join.
				</Trans>
			</p>
		);
	}

	const total = seatCost
		? formatCurrency(seatCost.amount * newPeople, seatCost.currency, {
				minimumFractionDigits: 0,
			})
		: "";
	const price =
		seatCost?.interval === "year"
			? t({ message: `${total}/year` })
			: t({ message: `${total}/month` });

	return (
		<p className="-mx-3 border-t px-3 py-2 text-muted-foreground text-xs">
			<Trans>
				New people get an email invite to {organizationName} and see this once
				they join.
			</Trans>{" "}
			{seatCost ? (
				<Plural
					value={newPeople}
					one={`This adds a paid seat (${price}).`}
					other={`This adds # paid seats (${price}).`}
				/>
			) : (
				<Trans>Each adds a paid seat.</Trans>
			)}
		</p>
	);
}
