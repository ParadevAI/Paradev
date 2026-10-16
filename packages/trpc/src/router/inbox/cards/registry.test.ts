import { describe, expect, test } from "bun:test";
import type { InboxDocument } from "../document";
import {
	cardTypes,
	documentTier,
	FINISHED_CARD_TYPES,
	resolveCard,
	runCardAction,
	UPDATE_CARD_TYPES,
} from "./registry";

const WORKSPACE = "00000000-0000-4000-8000-000000000000";
const paragraph = {
	id: "p",
	type: "paragraph" as const,
	paragraph: { rich_text: [{ type: "text" as const, text: { content: "x" } }] },
};
const cardBlock = (id: string, type: string) => ({
	id,
	type: "card" as const,
	card: { type, refs: { workspace: WORKSPACE } },
});
const doc = (blocks: InboxDocument["blocks"]): InboxDocument => ({
	object: "page",
	kind: "blocks",
	format_version: "2026-09-15",
	blocks,
});

const ctx = { readerId: "reader", organizationId: "org" };

describe("card registry", () => {
	test("four cards only report, and an agent's finished turn is a tier of its own", () => {
		expect([...UPDATE_CARD_TYPES].sort()).toEqual([
			"github.branch",
			"github.ci_failed",
			"superset.automation_failed",
			"superset.task_assigned",
		]);
		expect(FINISHED_CARD_TYPES).toEqual(["superset.agent_finished"]);
	});

	test("a card is an ask as soon as one block wants a decision; otherwise it is finished only when every card is a finished turn", () => {
		const finished = cardBlock("a", "superset.agent_finished");
		const ci = cardBlock("b", "github.ci_failed");
		expect(documentTier(doc([paragraph, finished]))).toBe("finished");
		expect(documentTier(doc([ci]))).toBe("update");
		expect(documentTier(doc([finished, ci]))).toBe("update");
		expect(
			documentTier(doc([finished, cardBlock("b", "superset.agent_needs")])),
		).toBe("ask");
		expect(documentTier(doc([finished, cardBlock("b", "acme.widget")]))).toBe(
			"ask",
		);
		expect(
			documentTier(
				doc([
					finished,
					{
						id: "q",
						type: "ask",
						ask: {
							questions: [{ id: "ok", kind: "confirm", prompt: "Ship it?" }],
						},
					},
				]),
			),
		).toBe("ask");
		expect(documentTier(doc([paragraph]))).toBe("ask");
		expect(documentTier(null)).toBe("ask");
	});

	test("lists the launch set", () => {
		expect(cardTypes()).toContain("superset.agent_needs");
		expect(cardTypes()).toContain("github.pull_request");
	});

	test("an unknown type renders as an error card, never markup", async () => {
		const card = await resolveCard({ type: "acme.widget", refs: {} }, ctx);
		expect(card.state).toBe("error");
		expect(card.brand).toBeNull();
		expect(card.actions).toEqual([]);
	});

	test("a Superset-only card an agent wrote renders unavailable and refuses actions", async () => {
		const agentCard = {
			...ctx,
			card: {
				id: "card",
				agentSessionId: "cli-b375b5ab",
				workspaceId: null,
				hostId: null,
				waiting: false,
				fromSuperset: false,
			},
		};
		const ref = {
			type: "superset.automation_failed",
			refs: { run: "00000000-0000-4000-8000-000000000000" },
		};
		const card = await resolveCard(ref, agentCard);
		expect(card.state).toBe("no_access");
		expect(card.actions).toEqual([]);
		await expect(
			runCardAction(ref, "retry", agentCard, undefined),
		).rejects.toThrow(/Only Superset/);
	});

	test("malformed identifiers render as an error card", async () => {
		const card = await resolveCard(
			{
				type: "superset.agent_needs",
				refs: { need: "credential", service: "fax" },
			},
			ctx,
		);
		expect(card.state).toBe("error");
		expect(card.notice?.text).toMatch(/malformed/);
	});

	test("a credential need renders from identifiers alone, offering only its own actions", async () => {
		const card = await resolveCard(
			{
				type: "superset.agent_needs",
				refs: { need: "credential", service: "github", scope: "repo" },
			},
			ctx,
		);
		expect(card.state).toBe("ok");
		expect(card.brand).toBe("superset");
		expect(card.title).toBe("Connect GitHub");
		expect(card.actions.map((a) => a.id)).toEqual(["connected", "declined"]);
		expect(card.actions[0]?.label).toBe("I connected GitHub");
	});

	test("an action returns the outcome the agent will receive", async () => {
		const { result, card } = await runCardAction(
			{
				type: "superset.agent_needs",
				refs: { need: "credential", service: "slack" },
			},
			"declined",
			ctx,
			"Use the bot token instead",
		);
		expect(result.outcome).toEqual({
			connected: false,
			note: "Use the bot token instead",
		});
		expect(card.state).toBe("ok");
	});

	test("a tool need offers approve and deny, and refuses a credential action", async () => {
		const tool = {
			type: "superset.agent_needs",
			refs: { need: "tool", tool: "gh pr merge" },
		};
		const card = await resolveCard(tool, ctx);
		expect(card.title).toBe("Allow gh pr merge");
		expect(card.actions.map((a) => a.id)).toEqual(["approve", "deny"]);
		await expect(
			runCardAction(tool, "connected", ctx, undefined),
		).rejects.toThrow(/does not apply/);
	});

	test("a need without what it names is malformed", async () => {
		const card = await resolveCard(
			{ type: "superset.agent_needs", refs: { need: "tool" } },
			ctx,
		);
		expect(card.state).toBe("error");
	});

	test("an unknown action is refused", async () => {
		await expect(
			runCardAction(
				{
					type: "superset.agent_needs",
					refs: { need: "credential", service: "slack" },
				},
				"revoke",
				ctx,
				undefined,
			),
		).rejects.toThrow(/no action revoke/);
	});
});
