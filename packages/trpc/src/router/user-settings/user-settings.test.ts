import { describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";

let stored: { experimentalChat: boolean } | undefined;
const upserts: Array<{ values: unknown; set: unknown }> = [];

stub(db.query.userSettings, { findFirst: async () => stored });
stub(db, {
	insert: () => ({
		values: (values: unknown) => ({
			onConflictDoUpdate: async ({ set }: { set: unknown }) => {
				upserts.push({ values, set });
				stored = {
					experimentalChat: (set as { experimentalChat: boolean })
						.experimentalChat,
				};
			},
		}),
	}),
});

const { userSettingsRouter } = await import("./user-settings");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const caller = createCallerFactory(
	createTRPCRouter({ userSettings: userSettingsRouter }),
)(
	createTRPCContext({
		session: { user: { id: "user-1" }, session: {} } as never,
		auth: {} as never,
		headers: new Headers(),
		sandboxCaller: null,
	}),
);

describe("userSettings", () => {
	test("an account without a row has Chat off, and update stores only what it was given", async () => {
		expect(await caller.userSettings.get()).toEqual({
			experimentalChat: false,
		});

		expect(
			await caller.userSettings.update({ experimentalChat: true }),
		).toEqual({ experimentalChat: true });
		expect(upserts).toEqual([
			{
				values: { experimentalChat: true, userId: "user-1" },
				set: { experimentalChat: true },
			},
		]);

		await caller.userSettings.update({});
		expect(upserts).toHaveLength(1);
	});
});
