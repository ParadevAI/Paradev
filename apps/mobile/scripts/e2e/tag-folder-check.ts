/**
 * Asserts the host's tags and folder settings after the tag-folder flows
 * moved fix-login into Feature work and deleted the bugs group. This is what
 * desktop reads, so it checks more than the phone's screen.
 *
 *   bun --env-file=../../.env scripts/e2e/tag-folder-check.ts --host <machineId>
 */
import { parseArgs } from "node:util";
import { mintJwt, relayUrl, signIn } from "./dev-session";

const { values } = parseArgs({ options: { host: { type: "string" } } });
if (!values.host)
	throw new Error("usage: tag-folder-check.ts --host <machineId>");

const { cookie, organizationId } = await signIn();
const jwt = await mintJwt(cookie);
const hostTrpc = `${relayUrl}/hosts/${organizationId}:${values.host}/trpc`;

async function query<T>(path: string): Promise<T> {
	const response = await fetch(`${hostTrpc}/${path}`, {
		headers: { authorization: `Bearer ${jwt}` },
	});
	if (!response.ok) throw new Error(`${path}: ${await response.text()}`);
	return (await response.json()).result.data.json as T;
}

const workspaces =
	await query<{ name: string; tags?: string[] }[]>("workspace.list");
const settings = await query<{ tag: string }[]>("tagFolders.list");
const tagsOf = (name: string) =>
	JSON.stringify(workspaces.find((workspace) => workspace.name === name)?.tags);

const expected: [string, string, string][] = [
	["fix-login tags", tagsOf("fix-login"), JSON.stringify(["features"])],
	["crash-on-start tags", tagsOf("crash-on-start"), JSON.stringify([])],
	["dark-mode tags", tagsOf("dark-mode"), JSON.stringify(["features"])],
	[
		"bugs settings removed",
		String(settings.some((setting) => setting.tag === "bugs")),
		"false",
	],
];
const failed = expected.filter(([, actual, wanted]) => actual !== wanted);
for (const [label, actual, wanted] of expected) {
	console.log(`${actual === wanted ? "ok  " : "FAIL"} ${label}: ${actual}`);
}
if (failed.length > 0) process.exit(1);
