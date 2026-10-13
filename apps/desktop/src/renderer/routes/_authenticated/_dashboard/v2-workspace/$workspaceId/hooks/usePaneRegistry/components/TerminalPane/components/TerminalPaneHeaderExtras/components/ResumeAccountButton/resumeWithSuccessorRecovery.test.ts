import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { resumeWithSuccessorRecovery } from "./resumeWithSuccessorRecovery";

test("a lost response follows the durable successor without retrying the resume", async () => {
	const client = new QueryClient();
	const key = ["terminal-resumed-successor", "workspace", "connected-source"];
	const successor = { terminalId: "durable-target", label: "Claude" };
	let attempts = 0;
	let lookups = 0;
	try {
		await resumeWithSuccessorRecovery(
			client,
			key,
			async () => {
				attempts++;
				throw new Error("lost mutation response");
			},
			async () => {
				lookups++;
				return successor;
			},
		);
		expect(client.getQueryData(key)).toEqual(successor);
		expect(attempts).toBe(1);
		expect(lookups).toBe(1);
	} finally {
		client.clear();
	}
});

test("a failed resume without an authoritative successor keeps its original error", async () => {
	const client = new QueryClient();
	const key = ["terminal-resumed-successor", "workspace", "source"];
	const failure = new Error("history changed");
	try {
		await expect(
			resumeWithSuccessorRecovery(
				client,
				key,
				async () => {
					throw failure;
				},
				async () => null,
			),
		).rejects.toBe(failure);
		expect(client.getQueryData(key)).toBeUndefined();
	} finally {
		client.clear();
	}
});
