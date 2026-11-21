import { expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../../test/stub";

const installationLookups: unknown[] = [];
stub(db.query.members, { findFirst: async () => ({ id: "membership" }) });
stub(db.query.githubUserConnections, { findFirst: async () => undefined });
stub(db.query.githubInstallations, {
	findFirst: async (query: unknown) => {
		installationLookups.push(query);
		return { id: "installation", installationId: "1" };
	},
});

const { asViewer } = await import("./viewer-octokit");

test("without the viewer's own GitHub connection a read asks them to connect, and the organization's App is not used", async () => {
	await expect(
		asViewer("00000000-0000-4000-8000-000000000001", {
			organizationId: "00000000-0000-4000-8000-000000000002",
			repoFullName: "acme/widgets",
			number: 7,
		}),
	).rejects.toMatchObject({
		code: "PRECONDITION_FAILED",
		message: "Connect GitHub in Settings to act on pull requests as yourself",
	});
	expect(installationLookups).toEqual([]);
});
