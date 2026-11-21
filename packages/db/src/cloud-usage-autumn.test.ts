import { describe, expect, test } from "bun:test";
import {
	type AutumnUsageEvent,
	autumnUsageByLock,
	LEGACY_LOCK_SEQ,
} from "./cloud-usage-autumn";

const ORG = "a0000000-0000-4000-8000-000000000001";
const USER = "b0000000-0000-4000-8000-000000000001";
const WORKSPACE = "c0000000-0000-4000-8000-000000000001";
const BOOTS = new Map([
	["boot_1", 2],
	["boot_2", 0],
]);

let nextId = 0;
function event(
	featureId: string,
	value: number,
	properties: Record<string, unknown>,
	timestamp = 1_000,
): AutumnUsageEvent {
	nextId += 1;
	return {
		id: `evt_${nextId}`,
		timestamp,
		featureId,
		customerId: ORG,
		value,
		properties,
	};
}

describe("autumnUsageByLock", () => {
	test("a reservation and its adjustment sum to the confirmed amount, attributed as sent", () => {
		const { locks } = autumnUsageByLock(
			[
				event(
					"box_gb_minutes",
					480,
					{ bootId: "boot_1", lockSeq: "0", workspaceId: WORKSPACE },
					1_000,
				),
				event(
					"box_gb_minutes",
					-141.3,
					{ bootId: "boot_1", lockSeq: 0, userId: "unattributed" },
					2_000,
				),
			],
			BOOTS,
		);
		expect(locks).toEqual([
			{
				bootId: "boot_1",
				lockSeq: 0,
				feature: "box_gb_minutes",
				organizationId: ORG,
				cloudWorkspaceId: WORKSPACE,
				userId: null,
				amount: 338.7,
				events: 2,
				lastEventAt: 2_000,
			},
		]);
	});

	test("a launch-night box re-send is the boot's legacy lock, and its reversal stays untied", () => {
		const correction = "legacy-lock-attribution";
		const { locks, untied } = autumnUsageByLock(
			[
				event("box_gb_minutes", 90, {}),
				event("box_gb_minutes", -90, { correction }),
				event("box_gb_minutes", 90, {
					bootId: "boot_1",
					userId: USER,
					correction,
				}),
			],
			BOOTS,
		);
		expect(locks).toMatchObject([
			{ bootId: "boot_1", lockSeq: LEGACY_LOCK_SEQ, amount: 90, userId: USER },
		]);
		expect(untied.map((untiedEvent) => untiedEvent.value)).toEqual([90, -90]);
	});

	test("a launch-night CPU re-send of an event that named its boot is dropped with its reversal", () => {
		const correction = "legacy-lock-attribution";
		const { locks, untied } = autumnUsageByLock(
			[
				event("active_cpu_minutes", 7, { bootId: "boot_1" }),
				event("active_cpu_minutes", -7, { correction }),
				event("active_cpu_minutes", 7, { bootId: "boot_1", correction }),
			],
			BOOTS,
		);
		expect(locks).toMatchObject([
			{
				bootId: "boot_1",
				lockSeq: 2,
				feature: "active_cpu_minutes",
				amount: 7,
			},
		]);
		expect(untied).toEqual([]);
	});

	test("an event listed twice under one id counts once", () => {
		const reservation = event("box_gb_minutes", 240, {
			bootId: "boot_2",
			lockSeq: 1,
		});
		const { locks } = autumnUsageByLock([reservation, reservation], BOOTS);
		expect(locks).toMatchObject([{ amount: 240, events: 1 }]);
	});

	test("an event with no boot, or a boot with no row, is untied", () => {
		const { locks, untied } = autumnUsageByLock(
			[
				event("box_gb_minutes", 1, {}),
				event("box_gb_minutes", 2, { bootId: "boot_gone", lockSeq: 0 }),
				event("seats", 3, { bootId: "boot_2" }),
			],
			BOOTS,
		);
		expect(locks).toEqual([]);
		expect(untied.map((untiedEvent) => untiedEvent.value)).toEqual([1, 2]);
	});
});
