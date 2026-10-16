import { Plural, useLingui } from "@lingui/react/macro";
import { formatList } from "@superset/i18n/format";
import type { CalendarGuestView } from "../../../../types";
import { guestCounts } from "../../utils/guestCounts";
import { GuestRow } from "./components/GuestRow";

interface GuestListProps {
	guests: CalendarGuestView[];
}

/** Google's guest section: the count, how many said what, then each guest. */
export function GuestList({ guests }: GuestListProps) {
	const { t } = useLingui();
	const { total, yes, no, maybe, awaiting } = guestCounts(guests);
	const rest = [
		no > 0 && t({ message: `${no} no` }),
		maybe > 0 && t({ message: `${maybe} maybe` }),
		awaiting > 0 && t({ message: `${awaiting} awaiting` }),
	].filter((part): part is string => Boolean(part));
	return (
		<div className="flex min-w-0 flex-col gap-2">
			<div className="flex flex-col text-xs text-muted-foreground">
				<span className="text-[13px] text-foreground">
					<Plural value={total} one="# guest" other="# guests" />
				</span>
				{yes > 0 && <span>{t({ message: `${yes} yes` })}</span>}
				{rest.length > 0 && (
					<span>{formatList(rest, { style: "short", type: "unit" })}</span>
				)}
			</div>
			<ul className="flex flex-col gap-2.5">
				{guests.map((guest) => (
					<GuestRow key={guest.email} guest={guest} />
				))}
			</ul>
		</div>
	);
}
