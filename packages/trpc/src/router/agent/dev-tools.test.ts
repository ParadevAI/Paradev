import { describe, expect, test } from "bun:test";
import { CHANNEL_MESSAGE_MAX_LENGTH } from "@superset/shared/channels";
import type { z } from "zod";
import { devToolsRouter } from "./dev-tools";

const [replyInput] = devToolsRouter.reply._def.inputs as z.ZodType[];
const target = `channel:${crypto.randomUUID()}`;

describe("reply", () => {
	test("takes a body as long as a channel message", () => {
		const body = "a".repeat(CHANNEL_MESSAGE_MAX_LENGTH);
		expect(replyInput?.safeParse({ target, body }).success).toBe(true);
	});

	test("refuses a body a channel message cannot hold", () => {
		const body = "a".repeat(CHANNEL_MESSAGE_MAX_LENGTH + 1);
		expect(replyInput?.safeParse({ target, body }).success).toBe(false);
	});
});
