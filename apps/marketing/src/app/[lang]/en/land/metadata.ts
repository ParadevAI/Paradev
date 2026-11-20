import { BRAND } from "@superset/shared/brand";
import type { Metadata } from "next";
import { localeUrl } from "@/app/[lang]/metadata";
import { landingCopy } from "./copy";

export function landingMetadata(slug: keyof typeof landingCopy): Metadata {
	const copy = landingCopy[slug];
	const title = `${copy.lead} ${copy.emphasis}`;
	const description = copy.feature.description;
	const url = localeUrl("en", `/land/${slug}`);
	return {
		title,
		description,
		alternates: { canonical: url },
		robots: { index: false, follow: true },
		openGraph: {
			type: "website",
			locale: "en_US",
			siteName: BRAND.NAME,
			url,
			title,
			description,
			images: ["/og-image.png"],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: ["/og-image.png"],
		},
	};
}
