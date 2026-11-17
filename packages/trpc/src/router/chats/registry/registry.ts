import type { RegistryCard, RegistryListing } from "@superset/chats-core";
import { LISTINGS, type Listing } from "./listings";

/** The listing with that slug, or undefined. */
export const findListing = (slug: string): Listing | undefined =>
	LISTINGS.find((listing) => listing.slug === slug);

/** What the directory shows of a listing. */
export const listingCard = (listing: Listing): RegistryCard => ({
	slug: listing.slug,
	name: listing.name,
	version: listing.version,
	summary: listing.summary,
	category: listing.category,
	for: listing.for,
	look: "plain",
	voice: "",
	color: listing.color,
	needs: {
		apps: listing.needs.apps.map((need) => need.app),
		optional: listing.needs.optional.map((need) => need.app),
	},
});

/** Everything a listing's page shows: what it says, what it brings, what it needs. */
export const listingDetail = (listing: Listing): RegistryListing => ({
	...listingCard(listing),
	needs: { ...listing.needs, mcp: [] },
	examples: listing.examples,
	triggers: [],
	sketches: [],
	tasks: [],
	skills: [
		...new Set(
			Object.keys(listing.skills).flatMap((path) => path.split("/")[1] ?? []),
		),
	],
	readme: listing.readme,
	instructions: listing.instructions,
	changelog: listing.changelog,
});

/** The files a Dev made from a listing starts with, by path in its folder. */
export const listingSeeds = (listing: Listing): Record<string, string> => ({
	"AGENTS.md": `${listing.instructions}\n`,
	...listing.skills,
});

export const allListings = () => LISTINGS;
