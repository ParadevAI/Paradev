import { describe, expect, test } from "bun:test";
import {
	agentChip,
	chipAgentId,
	chipDevId,
	devChip,
	mentionedDevIds,
} from "./memberChips";

describe("memberChips", () => {
	test("an agent chip reads as @name and names its workspace", () => {
		const chip = agentChip({
			id: "ws-1",
			name: "Ticket",
			branch: "fix/ticket",
		});
		expect(chip).toMatchObject({
			label: "@Ticket",
			serialized: "@Ticket",
			variant: "member",
		});
		expect(chipAgentId(chip)).toBe("ws-1");
		expect(chipDevId(chip)).toBeNull();
	});

	test("a Dev chip names its actor, also once sent with the mention mark", () => {
		const chip = devChip({ actorId: "dev-9", name: "Maren" });
		expect(chip.label).toBe("@Maren");
		expect(
			chipDevId({ data: { ...(chip.data as object), variant: "member" } }),
		).toBe("dev-9");
		expect(chipAgentId(chip)).toBeNull();
	});

	test("finds the Devs a message names, by chip or by @name in its text", () => {
		const devs = [
			{ actorId: "dev-1", name: "Ticket" },
			{ actorId: "dev-2", name: "Maren" },
			{ actorId: "dev-3", name: "Ticketing" },
		];
		const chip = devChip(devs[1] ?? { actorId: "", name: "" });
		expect(
			mentionedDevIds("@Ticket and @Maren, hi", [{ data: chip.data }], devs),
		).toEqual(["dev-2", "dev-1"]);
		expect(mentionedDevIds("email a@Ticket or @Ticketing2", [], devs)).toEqual(
			[],
		);
	});
});
