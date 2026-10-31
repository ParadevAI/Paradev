import { type EvalCase, m } from "../evalCase";

export const realWorldSet: EvalCase[] = [
	{
		id: "2026-10-30-roster-called-by-name",
		kind: "direct",
		channelName: "roster",
		devs: [{ id: "ticket", name: "Ticket", description: null }],
		recent: [],
		message: m("Satya", "what work is open here can you tell me ticket?"),
		expected: ["ticket"],
	},
];
