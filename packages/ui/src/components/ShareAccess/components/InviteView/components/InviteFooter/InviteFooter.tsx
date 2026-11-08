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
		<div className="-mx-3 space-y-1 border-t px-3 py-2 text-muted-foreground text-xs">
			{seatCost === undefined ? null : (
				<p data-seat-cost="">
					{seatCost === null ? (
						<Trans>
							Each new person adds a paid seat to {organizationName}.
						</Trans>
					) : seatCost.interval === "year" ? (
						<Plural
							value={newPeople}
							one={`Adds a paid seat to ${organizationName} (${total}/year), billed when they join.`}
							other={`Adds # paid seats to ${organizationName} (${total}/year), billed when they join.`}
						/>
					) : (
						<Plural
							value={newPeople}
							one={`Adds a paid seat to ${organizationName} (${total}/month), billed when they join.`}
							other={`Adds # paid seats to ${organizationName} (${total}/month), billed when they join.`}
						/>
					)}
				</p>
			)}
			<p>
				<Trans>
					New people get an email invite to {organizationName}. They see this
					once they join.
				</Trans>
			</p>
		</div>
	);
}
