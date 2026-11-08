import { Plural, Trans } from "@lingui/react/macro";
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
	const { formatCurrency } = useFormat();
	if (!newPeople) return null;

	const total = seatCost
		? formatCurrency(seatCost.amount * newPeople, seatCost.currency, {
				minimumFractionDigits: 0,
			})
		: "";

	return (
		<p className="-mx-3 border-t px-3 py-2 text-muted-foreground text-xs">
			{seatCost === undefined ? (
				<Trans>
					New people get an email invite to {organizationName}. They see this
					once they join.
				</Trans>
			) : seatCost === null ? (
				<Trans>
					New people get an email invite to {organizationName} and see this once
					they join, which adds a paid seat for each.
				</Trans>
			) : seatCost.interval === "year" ? (
				<Plural
					value={newPeople}
					one={`The new person gets an email invite to ${organizationName} and sees this once they join, which adds a paid seat (${total}/year).`}
					other={`New people get an email invite to ${organizationName} and see this once they join, which adds # paid seats (${total}/year).`}
				/>
			) : (
				<Plural
					value={newPeople}
					one={`The new person gets an email invite to ${organizationName} and sees this once they join, which adds a paid seat (${total}/month).`}
					other={`New people get an email invite to ${organizationName} and see this once they join, which adds # paid seats (${total}/month).`}
				/>
			)}
		</p>
	);
}
