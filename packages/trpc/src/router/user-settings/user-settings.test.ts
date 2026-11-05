import { describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";

type Stored = { experimentalChat: boolean; namingInstructions: string | null };
let stored: Stored | undefined;
const upserts: Array<{ values: unknown; set: unknown }> = [];

stub(db.query.userSettings, { findFirst: async () => stored });
stub(db, {
	insert: () => ({
		values: (values: unknown) => ({
			onConflictDoUpdate: async ({ set }: { set: Partial<Stored> }) => {
				upserts.push({ values, set });
				stored = {
					experimentalChat: false,
					namingInstructions: null,
					...stored,
					...set,
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
	test("an account without a row gets the defaults, and update stores only what it was given", async () => {
		expect(await caller.userSettings.get()).toEqual({
			experimentalChat: false,
			namingInstructions: null,
		});

		expect(
			await caller.userSettings.update({ experimentalChat: true }),
		).toEqual({ experimentalChat: true, namingInstructions: null });
		expect(upserts).toEqual([
			{
				values: {
					experimentalChat: true,
					namingInstructions: null,
					userId: "user-1",
				},
				set: { experimentalChat: true },
			},
		]);

		await caller.userSettings.update({});
		expect(upserts).toHaveLength(1);
	});

	test("naming instructions are trimmed, and blank clears them", async () => {
		expect(
			await caller.userSettings.update({
				namingInstructions: "  Prefix branches with feat/  ",
			}),
		).toMatchObject({ namingInstructions: "Prefix branches with feat/" });

		expect(
			await caller.userSettings.update({ namingInstructions: "   " }),
		).toMatchObject({ namingInstructions: null });
		expect(upserts.at(-1)?.set).toEqual({ namingInstructions: null });
	});
});
