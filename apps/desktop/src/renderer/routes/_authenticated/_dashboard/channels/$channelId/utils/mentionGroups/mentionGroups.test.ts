import { expect, test } from "bun:test";
import { rankMentionCandidates } from "./mentionGroups";

const person = (id: string, name: string) => ({ id, name, image: null });
const people = [
	person("1", "Kiet Ho"),
	person("2", "Avi Peltz"),
	person("3", "Harshith Mullapudi"),
	person("4", "Satya Patel"),
];

test("lists channel members first, then everyone else", () => {
	const { members, others } = rankMentionCandidates(
		people,
		new Set(["4", "1"]),
		"",
	);
	expect(members.map((p) => p.name)).toEqual(["Kiet Ho", "Satya Patel"]);
	expect(others.map((p) => p.name)).toEqual([
		"Avi Peltz",
		"Harshith Mullapudi",
	]);
});

test("matches the start of any name", () => {
	const { members, others } = rankMentionCandidates(people, new Set(), "pa");
	expect([...members, ...others].map((p) => p.name)).toEqual(["Satya Patel"]);
	expect(rankMentionCandidates(people, new Set(), "mull").others).toHaveLength(
		1,
	);
});
