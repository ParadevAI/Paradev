import { CLIError, number, positional } from "@superset/cli-framework";
import type { ApiClient } from "../../../lib/api-client";
import { command } from "../../../lib/command";
import { pageLinkVersion, pageRefFromArg } from "../pageRef";

const DOWNLOAD_TIMEOUT_MS = 30_000;

function downloadFailed(version: number, cause: unknown): CLIError {
	const detail =
		cause instanceof Error && cause.name === "TimeoutError"
			? `The blob store did not respond within ${DOWNLOAD_TIMEOUT_MS / 1000}s`
			: cause instanceof Error
				? cause.message
				: String(cause);
	return new CLIError(`Could not download version ${version}`, detail);
}

const SIGN_IN = "Run: superset auth login";

async function servedToAnyone(
	api: ApiClient,
	page: string,
	requested: number | undefined,
): Promise<{ version: number; downloadUrl: string }> {
	const ref = pageRefFromArg(page);
	if (!("slug" in ref)) {
		throw new CLIError(
			"Not logged in",
			`Signed out, pass the page's slug or link to read a public page. ${SIGN_IN}`,
		);
	}
	const view = await api.page.publicView.query({
		slug: ref.slug,
		download: true,
	});
	if (!view) {
		throw new CLIError(
			"Page not found",
			`Signed out, only pages anyone with the link can see are readable. ${SIGN_IN}`,
		);
	}
	if (requested !== undefined && requested !== view.version) {
		throw new CLIError(
			`Version ${requested} not found`,
			`Signed out, only the version currently served (${view.version}) is readable`,
		);
	}
	if (!view.downloadUrl) {
		throw new CLIError(
			`Could not download version ${view.version}`,
			"The download link is not available right now. Try again in a minute",
		);
	}
	return { version: view.version, downloadUrl: view.downloadUrl };
}

export default command({
	description: "Write a published version's HTML to stdout",
	args: [positional("page").required().desc("Page id, slug or link")],
	options: {
		version: number()
			.alias("v")
			.desc(
				"Version to fetch (defaults to a link's ?v=, else the one currently served)",
			),
	},
	run: async ({ ctx, args, options }) => {
		const page = args.page as string;
		const requested = options.version ?? pageLinkVersion(page);
		const version =
			ctx.authSource === "signed_out"
				? await servedToAnyone(ctx.api, page, requested)
				: await ctx.api.page.pull.query({
						...pageRefFromArg(page),
						...(requested ? { version: requested } : {}),
					});

		let body: ArrayBuffer;
		try {
			const response = await fetch(version.downloadUrl, {
				signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
			});
			if (!response.ok) {
				throw new CLIError(
					`Could not download version ${version.version}`,
					`The blob store answered ${response.status}`,
				);
			}
			body = await response.arrayBuffer();
		} catch (error) {
			if (error instanceof CLIError) throw error;
			throw downloadFailed(version.version, error);
		}

		process.stdout.write(Buffer.from(body));
		return undefined;
	},
});
