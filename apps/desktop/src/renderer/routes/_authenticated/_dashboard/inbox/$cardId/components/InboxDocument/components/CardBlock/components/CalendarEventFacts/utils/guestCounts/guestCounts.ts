import type { CalendarGuestView } from "../../../../types";

/** How many guests gave each answer, as Google's guest summary counts them. */
export function guestCounts(guests: Pick<CalendarGuestView, "response">[]) {
	const count = (response: CalendarGuestView["response"]) =>
		guests.filter((guest) => guest.response === response).length;
	return {
		total: guests.length,
		yes: count("accepted"),
		no: count("declined"),
		maybe: count("tentative"),
		awaiting: count("needsAction"),
	};
}
