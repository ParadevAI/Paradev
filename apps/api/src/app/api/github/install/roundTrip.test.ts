import { describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import * as dbUtils from "@superset/db/utils";
import { getBrowserApiUrl } from "@superset/shared/browser-api-url";
import * as syncPolicy from "@superset/trpc/sync-policy";
import { Client } from "@upstash/qstash";
import { env } from "@/env";
import * as orgMember from "@/lib/integrations/requireOrgMember";
import { stub } from "../../../../../test/stub";
import { GET as callback } from "../callback/route";
import * as persistence from "../callback/utils/saveInstallation";
import { githubApp } from "../octokit";
import { GET as install } from "./route";

stub(orgMember, {
	requireOrgMember: async () => ({
		organizationId: "org-1",
		userId: "user-1",
		role: "admin",
	}),
});
stub(syncPolicy, { organizationSyncsNow: async () => true });
stub(dbUtils, { findOrgMembership: async () => ({ role: "admin" }) });
stub(db.query.githubInstallations, { findFirst: async () => undefined });
stub(githubApp, {
	getInstallationOctokit: async () => ({
		request: async () => ({
			data: {
				id: 123,
				account: { login: "test-org", type: "Organization" },
				permissions: {},
			},
		}),
	}),
});
let saved: unknown;
stub(persistence, {
	saveInstallation: async (installation: unknown) => {
		saved = installation;
		return { id: "installation-1" };
	},
});
stub(Client.prototype, {
	publishJSON: async () => ({ messageId: "test-job" }),
});

const origin = new URL(getBrowserApiUrl(env)).origin;

describe("GitHub installation browser round trip", () => {
	test("returns a callback on another host to the cookie host before checking state", async () => {
		const start = await install(
			new Request(`${origin}/api/github/install?organizationId=org-1`),
		);
		const provider = new URL(start.headers.get("location") ?? "");
		const cookie = start.headers.get("set-cookie")?.split(";")[0] ?? "";
		const returned = new URL("https://wrong-host.test/api/github/callback");
		returned.searchParams.set("installation_id", "123");
		returned.searchParams.set("setup_action", "install");
		returned.searchParams.set(
			"state",
			provider.searchParams.get("state") ?? "",
		);

		const redirected = await callback(new Request(returned));
		const destination = new URL(redirected.headers.get("location") ?? "");
		expect(destination.origin).toBe(origin);
		expect(destination.pathname).toBe("/api/github/callback");
		expect(destination.search).toBe(returned.search);
		expect(redirected.headers.get("set-cookie")).toBeNull();

		const completed = await callback(
			new Request(destination, { headers: { cookie } }),
		);
		expect(
			new URL(completed.headers.get("location") ?? "").searchParams.get(
				"success",
			),
		).toBe("github_installed");
		expect(saved).toMatchObject({
			organizationId: "org-1",
			userId: "user-1",
			installationId: "123",
		});
	});
});
