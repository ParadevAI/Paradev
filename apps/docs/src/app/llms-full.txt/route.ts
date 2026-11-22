import { BRAND } from "@superset/shared/brand";
import { getLLMText, source } from "@/lib/source";

export const revalidate = false;

export async function GET() {
	const scan = source.getPages().map(getLLMText);
	const scanned = await Promise.all(scan);
	const header = [
		`# ${BRAND.INTRO_NAME} Documentation`,
		`> Official documentation for ${BRAND.INTRO_NAME} — run parallel AI coding agents in isolated Git worktrees on your machine.`,
	].join("\n\n");

	return new Response([header, ...scanned].join("\n\n---\n\n"), {
		headers: {
			"Content-Type": "text/plain",
			"X-Robots-Tag": "noindex, nofollow",
		},
	});
}
