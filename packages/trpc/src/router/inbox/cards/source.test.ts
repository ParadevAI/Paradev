import { describe, expect, test } from "bun:test";
import { cardSource } from "./source";
import type { CardView } from "./types";

const view = (value: unknown) => value as CardView;

describe("where a card's subject lives", () => {
	test("a field's link wins", () => {
		expect(
			cardSource(
				[
					{ label: "Reason", value: "Fraudulent" },
					{
						label: "Dispute",
						value: "du_1",
						href: "https://dashboard.stripe.com/disputes/du_1",
					},
				],
				view({ pull: { url: "https://github.com/acme/widgets/pull/4" } }),
			),
		).toBe("https://dashboard.stripe.com/disputes/du_1");
	});

	test("without one, the first link the view carries, a permalink before a plain url", () => {
		expect(
			cardSource(
				[],
				view({
					kind: "slack.thread",
					root: {
						url: "https://files.slack.com/x.png",
						permalink: "https://acme.slack.com/archives/C1/p1",
					},
				}),
			),
		).toBe("https://acme.slack.com/archives/C1/p1");
		expect(
			cardSource(
				[],
				view({
					runs: [{ jobs: [{ url: "https://github.com/acme/w/runs/9" }] }],
				}),
			),
		).toBe("https://github.com/acme/w/runs/9");
	});

	test("only web links count, and a card with none has no source", () => {
		expect(
			cardSource(
				[{ label: "Connect", value: "x", href: "#/settings/integrations" }],
				view({ url: "http://insecure.example", note: "see https://x.example" }),
			),
		).toBeUndefined();
		expect(cardSource([], undefined)).toBeUndefined();
	});
});
