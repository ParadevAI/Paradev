import { describe, expect, test } from "bun:test";
import { inboxSourceTarget } from "./inboxSourceTarget";

const card = (
	blocks: { type: string; resolved?: { source?: string } }[] | null,
	workspaceId: string | null = null,
) => ({ kind: "card" as const, workspaceId, agentSessionId: "t1", blocks });

describe("open in its app", () => {
	test("a card goes to what it is about: the first integration card with a web address", () => {
		expect(
			inboxSourceTarget(
				card(
					[
						{ type: "paragraph" },
						{ type: "card", resolved: {} },
						{
							type: "card",
							resolved: {
								source: "https://dashboard.stripe.com/invoices/in_1",
							},
						},
					],
					"w1",
				),
			),
		).toEqual({
			kind: "url",
			url: "https://dashboard.stripe.com/invoices/in_1",
		});
	});

	test("with no web address it goes to the session that sent it", () => {
		expect(
			inboxSourceTarget(card([{ type: "card", resolved: {} }], "w1")),
		).toEqual({ kind: "session", workspaceId: "w1", terminalId: "t1" });
		expect(inboxSourceTarget(card(null, "w1"))).toEqual({
			kind: "session",
			workspaceId: "w1",
			terminalId: "t1",
		});
	});

	test("a card with neither has nothing to open", () => {
		expect(inboxSourceTarget(card(null))).toEqual({ kind: "none" });
	});

	test("a finished workspace opens the workspace", () => {
		expect(inboxSourceTarget({ kind: "finished", workspaceId: "w9" })).toEqual({
			kind: "workspace",
			workspaceId: "w9",
		});
	});
});
