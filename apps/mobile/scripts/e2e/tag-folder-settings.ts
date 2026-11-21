/**
 * Gives a project's tag folders the presentation desktop would save: a
 * renamed, colored "features" folder ordered before a colored "bugs" folder.
 * Written through the relay as the dev user, since folder settings and tags
 * belong to the user who set them.
 *
 *   bun --env-file=../../.env scripts/e2e/tag-folder-settings.ts --host <machineId> --project <projectId>
 */
import { parseArgs } from "node:util";
import { mintJwt, relayUrl, signIn } from "./dev-session";

const { values } = parseArgs({
	options: { host: { type: "string" }, project: { type: "string" } },
});
if (!values.host || !values.project) {
	throw new Error(
		"usage: tag-folder-settings.ts --host <machineId> --project <projectId>",
	);
}

const { cookie, organizationId } = await signIn();
const jwt = await mintJwt(cookie);
const hostTrpc = `${relayUrl}/hosts/${organizationId}:${values.host}/trpc`;

for (const folder of [
	{
		tag: "features",
		displayName: "Feature work",
		color: "#3b82f6",
		tabOrder: 1,
	},
	{ tag: "bugs", color: "#ef4444", tabOrder: 2 },
]) {
	const response = await fetch(`${hostTrpc}/tagFolders.upsert`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${jwt}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ json: { scope: values.project, ...folder } }),
	});
	if (!response.ok) {
		throw new Error(
			`tagFolders.upsert ${folder.tag}: ${await response.text()}`,
		);
	}
}
console.log(`folder settings written for ${values.project}`);
