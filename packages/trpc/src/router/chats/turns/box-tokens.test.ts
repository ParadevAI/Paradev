import { expect, test } from "bun:test";
import {
	generateBoxKeys,
	signBoxCredential,
	signBoxToken,
	verifyBoxCredential,
} from "./box-tokens";

test("a box credential names its Dev and box, and only this API's key signs one", async () => {
	const keys = await generateBoxKeys();
	const other = await generateBoxKeys();
	const credential = await signBoxCredential(keys, {
		agentId: "agent-1",
		boxId: "box-1",
	});
	expect(await verifyBoxCredential(keys, credential)).toEqual({
		agentId: "agent-1",
		boxId: "box-1",
	});
	expect(await verifyBoxCredential(other, credential)).toBeNull();
});

test("a token meant for a box is not a credential for the API", async () => {
	const keys = await generateBoxKeys();
	const token = await signBoxToken(keys, {
		boxId: "box-1",
		scope: "control",
		sessionId: "chat-1",
	});
	expect(await verifyBoxCredential(keys, token)).toBeNull();
});
