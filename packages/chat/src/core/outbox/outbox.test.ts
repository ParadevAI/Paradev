import { expect, test } from "bun:test";
import { Outbox } from "./outbox";

test("a hold stops an in-progress flush before the next queued send", async () => {
	let canSend = true;
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	const sent: string[] = [];
	const outbox = new Outbox({
		canSend: () => canSend,
		send: async (entry) => {
			sent.push(entry.clientId);
			if (sent.length === 1) await pending;
			outbox.confirm(entry.clientId);
		},
	});
	const first = outbox.enqueue([{ type: "text", text: "first" }]);
	const second = outbox.enqueue([{ type: "text", text: "second" }]);
	const flushing = outbox.flush();
	canSend = false;
	release();
	await flushing;
	expect(sent).toEqual([first.clientId]);
	expect(outbox.snapshot()).toMatchObject([
		{ clientId: second.clientId, state: "queued", attempts: 0 },
	]);
	canSend = true;
	await outbox.flush();
	expect(sent).toEqual([first.clientId, second.clientId]);
	expect(outbox.snapshot()).toEqual([]);
});

test("a flush does not send an entry discarded while another send was pending", async () => {
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	const sent: string[] = [];
	const outbox = new Outbox({
		send: async (entry) => {
			sent.push(entry.clientId);
			await pending;
			outbox.confirm(entry.clientId);
		},
	});
	const first = outbox.enqueue([{ type: "text", text: "first" }]);
	const removed = outbox.enqueue([{ type: "text", text: "removed" }]);
	const flushing = outbox.flush();
	outbox.discard(removed.clientId);
	release();
	await flushing;
	expect(sent).toEqual([first.clientId]);
});
