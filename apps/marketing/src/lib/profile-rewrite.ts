import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fetchParticipant } from "@/app/[lang]/utils/fetchLeaderboard";

export async function rewriteProfile(
	request: NextRequest,
	locale: string,
	handle: string,
	lookup: (
		handle: string,
		options: { period: "all" },
		signal?: AbortSignal,
	) => Promise<{ handle: string } | null> = fetchParticipant,
) {
	const url = request.nextUrl.clone();
	url.pathname = `/${locale}/user/${handle}`;

	try {
		if (
			(await lookup(handle, { period: "all" }, AbortSignal.timeout(3_000))) ===
			null
		) {
			return NextResponse.rewrite(url, {
				status: 404,
				headers: { "X-Robots-Tag": "noindex" },
			});
		}
	} catch {
		// An unavailable API must not turn an existing profile into a cached 404.
	}

	return NextResponse.rewrite(url);
}
