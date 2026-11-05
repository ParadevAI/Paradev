import { COMPANY } from "@superset/shared/constants";
import { SITEMAP_GROUPS } from "../sitemaps/sitemap-groups";

export function GET() {
	const entries = SITEMAP_GROUPS.map(
		(group) =>
			`\t<sitemap>\n\t\t<loc>${COMPANY.MARKETING_URL}/sitemaps/sitemap/${group}.xml</loc>\n\t</sitemap>`,
	).join("\n");
	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
	return new Response(body, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
