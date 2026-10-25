import { COMPANY } from "@superset/shared/constants";
import type { ReleaseNotesResponse } from "@superset/shared/release-notes";
import { getChangelogEntries, getReleaseNotes } from "@/lib/changelog";

export async function GET() {
	const body: ReleaseNotesResponse = {
		releases: getReleaseNotes(getChangelogEntries(), COMPANY.MARKETING_URL),
	};

	return Response.json(body, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
