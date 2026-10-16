import { describe, expect, test } from "bun:test";
import type { SelectConnection } from "@superset/db/schema";
import { WATCH_RENEW_WINDOW_MS } from "@superset/trpc/integrations/google";
import { GaxiosError } from "gaxios";
import {
	type GmailWatchDeps,
	reconcileGmailWatch,
	watchTopicsFor,
} from "./reconcileWatches";

const NOW = Date.parse("2026-10-09T06:00:00Z");
const HOUR = 60 * 60 * 1000;
const RENEWED_EXPIRATION = NOW + 7 * 24 * HOUR;
const PRIMARY_TOPIC = "projects/main/topics/gmail";
const CONNECTOR_TOPIC = "projects/sigma/topics/gmail";
const CONNECTOR_SCOPES = [
	"openid",
	"email",
	"https://www.googleapis.com/auth/gmail.modify",
];

function topicInOtherProject(project: string): GaxiosError {
	const error = new GaxiosError(
		`Invalid topicName does not match projects/${project}/topics/*`,
		{ url: new URL("https://gmail.googleapis.com"), headers: new Headers() },
	);
	error.status = 400;
	return error;
}

function connection(
	gmail: { historyId?: string; watchExpiresAt?: number } | null,
	scopes: string[] | null = null,
): SelectConnection {
	return {
		id: "conn-1",
		scopes,
		state: gmail ? { provider: "google", gmail } : null,
	} as SelectConnection;
}

function harness() {
	const calls = {
		watched: [] as string[],
		topics: [] as string[],
		patched: [] as unknown[],
		synced: [] as string[],
	};
	const deps: GmailWatchDeps = {
		topics: { primary: PRIMARY_TOPIC, connector: CONNECTOR_TOPIC },
		now: NOW,
		watch: async (connectionId, topic) => {
			calls.watched.push(connectionId);
			calls.topics.push(topic);
			return { historyId: "fresh", expiration: RENEWED_EXPIRATION };
		},
		patch: async (_connectionId, patch) => {
			calls.patched.push(patch);
		},
		sync: async (synced) => {
			calls.synced.push(synced.id);
			return { baseline: false, added: 3, recorded: 3, matched: 1 };
		},
	};
	return { calls, deps };
}

describe("reconcileGmailWatch", () => {
	test("leaves a watch with more than the renew window left", async () => {
		const { calls, deps } = harness();
		const outcome = await reconcileGmailWatch(
			connection({
				historyId: "1",
				watchExpiresAt: NOW + WATCH_RENEW_WINDOW_MS + HOUR,
			}),
			deps,
		);
		expect(outcome).toEqual({ status: "current" });
		expect(calls.watched).toEqual([]);
	});

	test("renews inside the window and keeps the history id", async () => {
		const { calls, deps } = harness();
		const outcome = await reconcileGmailWatch(
			connection({ historyId: "1", watchExpiresAt: NOW + 24 * HOUR }),
			deps,
		);
		expect(outcome).toEqual({ status: "watched" });
		expect(calls.patched).toEqual([
			{ watchExpiresAt: RENEWED_EXPIRATION, historyId: "1" },
		]);
		expect(calls.synced).toEqual([]);
	});

	test("watches a connection that never had a watch", async () => {
		const { calls, deps } = harness();
		const outcome = await reconcileGmailWatch(connection(null), deps);
		expect(outcome).toEqual({ status: "watched" });
		expect(calls.patched).toEqual([
			{ watchExpiresAt: RENEWED_EXPIRATION, historyId: "fresh" },
		]);
		expect(calls.synced).toEqual([]);
	});

	test("re-watches a lapsed watch and catches up the missed mail", async () => {
		const { calls, deps } = harness();
		const outcome = await reconcileGmailWatch(
			connection({ historyId: "1", watchExpiresAt: NOW - 34 * HOUR }),
			deps,
		);
		expect(outcome).toEqual({
			status: "rewatched_after_lapse",
			catchUp: { baseline: false, added: 3, recorded: 3, matched: 1 },
		});
		expect(calls.patched).toEqual([
			{ watchExpiresAt: RENEWED_EXPIRATION, historyId: "1" },
		]);
		expect(calls.synced).toEqual(["conn-1"]);
	});

	test("reports a failed catch-up without losing the new watch", async () => {
		const { calls, deps } = harness();
		const outcome = await reconcileGmailWatch(
			connection({ historyId: "1", watchExpiresAt: NOW - HOUR }),
			{
				...deps,
				sync: async () => {
					throw new Error("history walk failed");
				},
			},
		);
		expect(outcome).toMatchObject({
			status: "rewatched_after_lapse",
			catchUp: { error: "history walk failed" },
		});
		expect(calls.patched).toHaveLength(1);
	});

	test("skips a connection granted no Gmail read scope", async () => {
		const { calls, deps } = harness();
		const outcome = await reconcileGmailWatch(
			connection(null, [
				"openid",
				"https://www.googleapis.com/auth/calendar.readonly",
			]),
			deps,
		);
		expect(outcome).toEqual({ status: "no_gmail_scope" });
		expect(calls.watched).toEqual([]);
	});

	test("watches a connector-flow connection on the connector topic", async () => {
		const { calls, deps } = harness();
		await reconcileGmailWatch(connection(null, CONNECTOR_SCOPES), deps);
		expect(calls.topics).toEqual([CONNECTOR_TOPIC]);
	});

	test("moves to the other topic when Gmail names another project", async () => {
		const { calls, deps } = harness();
		const outcome = await reconcileGmailWatch(connection(null), {
			...deps,
			watch: async (_connectionId, topic) => {
				calls.topics.push(topic);
				if (topic === PRIMARY_TOPIC) throw topicInOtherProject("sigma");
				return { historyId: "fresh", expiration: RENEWED_EXPIRATION };
			},
		});
		expect(outcome).toEqual({ status: "watched" });
		expect(calls.topics).toEqual([PRIMARY_TOPIC, CONNECTOR_TOPIC]);
	});

	test("does not try the other topic for an unrelated failure", async () => {
		const { calls, deps } = harness();
		const attempt = reconcileGmailWatch(connection(null), {
			...deps,
			watch: async (_connectionId, topic) => {
				calls.topics.push(topic);
				throw new Error("network down");
			},
		});
		await expect(attempt).rejects.toThrow("network down");
		expect(calls.topics).toEqual([PRIMARY_TOPIC]);
	});
});

describe("watchTopicsFor", () => {
	test("skips a topic that is not configured", () => {
		expect(
			watchTopicsFor(CONNECTOR_SCOPES, { primary: PRIMARY_TOPIC }),
		).toEqual([PRIMARY_TOPIC]);
	});
});
