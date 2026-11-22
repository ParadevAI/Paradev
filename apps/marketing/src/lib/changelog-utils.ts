/**
 * Pure utility functions and types for the changelog system.
 * These can be safely imported in both server and client components.
 */

import type { ReleaseHighlight } from "@superset/shared/release-notes";
import { formatContentDate, stripInlineMarkdown } from "./content-utils";
import type { ImageDimensions } from "./public-image-size";

export interface ChangelogEntry {
	slug: string;
	url: string;
	title: string;
	description?: string;
	date: string;
	image?: string;
	imageSize?: ImageDimensions;
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

const SUMMARY_MAX_LENGTH = 160;
const CATCH_ALL_SECTIONS = new Set([
	"improvements",
	"more improvements",
	"also shipped this week",
	"also in this batch",
	"minor updates",
	"more to come",
	"a peek at what's next",
]);

export function summarizeChangelogEntry(
	entry: Pick<ChangelogEntry, "description" | "content">,
): string | undefined {
	if (entry.description) return entry.description;

	const sections = [...entry.content.matchAll(/^##\s+(.+)$/gm)]
		.map((match) => stripInlineMarkdown(match[1] ?? ""))
		.filter(
			(heading) =>
				heading &&
				!CATCH_ALL_SECTIONS.has(heading.toLowerCase().replace("\u2019", "'")),
		);

	const included: string[] = [];
	for (const section of sections) {
		if (
			included.length > 0 &&
			joinSections([...included, section]).length > SUMMARY_MAX_LENGTH
		) {
			break;
		}
		included.push(section);
	}

	return included.length > 0 ? joinSections(included) : undefined;
}

function joinSections(sections: string[]): string {
	return `${sections.join("; ")}.`;
}
