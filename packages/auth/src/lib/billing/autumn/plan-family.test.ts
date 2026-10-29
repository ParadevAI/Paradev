import { describe, expect, test } from "bun:test";
import type { PlanFamily } from "@superset/shared/billing";
import { emailPlanFor, upgradedFrom } from "./plan-family";

function family(key: string, name: string, gbMinutesPerSeat: number | null) {
	return {
		family: key,
		name,
		displayOrder: 0,
		monthly: { id: `${key}_monthly`, name, interval: "month", seatPrice: 1 },
		yearly: null,
		legacy: [],
		gbMinutesPerSeat,
		overagePerGbHour: null,
		pack: null,
		environments: null,
	} satisfies PlanFamily;
}

const catalog = [
	family("pro", "Pro", null),
	family("team", "Team", 9600),
	family("ultra", "Ultra", 48000),
];

describe("upgradedFrom", () => {
	const team = emailPlanFor(catalog, "team_monthly");

	test("moving up a family names the family it came from", () => {
		expect(team?.previousName).toBe("Pro");
		expect(team && upgradedFrom(catalog, "pro", team)?.name).toBe("Pro");
	});

	test("a first plan, a repeat sync and a downgrade send nothing", () => {
		if (!team) throw new Error("team plan missing");
		expect(upgradedFrom(catalog, null, team)).toBeNull();
		expect(upgradedFrom(catalog, "team", team)).toBeNull();
		expect(upgradedFrom(catalog, "ultra", team)).toBeNull();
	});
});
