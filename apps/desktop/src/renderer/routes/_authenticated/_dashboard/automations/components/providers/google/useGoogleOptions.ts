import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ProviderOptions } from "../types";

/**
 * The pickable values the Google sentences need: the connected account's
 * calendars and mail labels, and the org's linked Google addresses for the
 * attendee filter. Empty until an account is connected.
 */
export function useGoogleOptions(organizationId: string): ProviderOptions {
	// Calendars and labels are read live from Google, not from a synced table
	// like GitHub's repositories, so a stale-time keeps opening a card from
	// spending two Google calls every time.
	const query = { enabled: Boolean(organizationId), staleTime: 5 * 60_000 };
	const calendars = cloudTrpc.integration.google.listCalendars.useQuery(
		{ organizationId },
		query,
	);
	const labels = cloudTrpc.integration.google.listLabels.useQuery(
		{ organizationId },
		query,
	);
	const people = cloudTrpc.integration.google.listLinkedPeople.useQuery(
		{ organizationId },
		query,
	);

	return useMemo(
		() => ({
			google: {
				calendars: calendars.data ?? [],
				gmailLabels: labels.data ?? [],
				people: people.data ?? [],
			},
		}),
		[calendars.data, labels.data, people.data],
	);
}
