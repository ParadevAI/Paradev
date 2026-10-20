/**
 * Pure utility functions and types for the changelog system.
 * These can be safely imported in both server and client components.
 */

import type { ReleaseHighlight } from "@superset/shared/release-notes";
import { formatContentDate } from "./content-utils";

export interface ChangelogEntry {
	slug: string;
	url: string;
	title: string;
	description?: string;
	date: string;
	image?: string;
	/** First desktop release that ships everything in this entry. */
	version?: string;
	/** Shown in the desktop app's release card and dialog. */
	highlights?: ReleaseHighlight[];
	content: string;
	/** Draft entries (frontmatter `draft: true`) never render on the site. */
	draft?: boolean;
}

export { slugify } from "./content-utils";

export function formatChangelogDate(date: string): string {
	return formatContentDate(date, "long");
}
