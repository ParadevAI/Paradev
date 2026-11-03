import { describe, expect, test } from "bun:test";
import { inviteSuggestions, pickableIndexes } from "./inviteSuggestions";
import type { ShareDirectory, ShareGrantee } from "./types";

const kenji = {
	userId: "kt",
	name: "Kenji Tanaka",
	email: "kenji@acme.dev",
	image: null,
};

const directory: ShareDirectory = {
	members: [
		{ userId: "mr", name: "Maya Rivera", email: "maya@acme.dev", image: null },
		{ userId: "do", name: "Dev Okafor", email: "dev@acme.dev", image: null },
		{
			userId: "kt",
			name: "Kenji Tanaka",
			email: "kenji@acme.dev",
			image: null,
		},
	],
	teams: [{ teamId: "design", name: "Design", memberIds: ["do"] }],
	domains: ["acme.dev", "gmail.com"],
};

const grantees: ShareGrantee[] = [
	{
		kind: "user",
		userId: "do",
		name: "Dev Okafor",
		email: "dev@acme.dev",
		image: null,
		role: null,
	},
	{
		kind: "invitation",
		invitationId: "i1",
		email: "sam@studio.design",
		role: null,
	},
];

const suggest = (
	query: string,
	overrides: Partial<Parameters<typeof inviteSuggestions>[0]> = {},
) =>
	inviteSuggestions({
		query,
		directory,
		grantees,
		staged: [],
		ownerId: "mr",
		inviteNew: "allowed",
		...overrides,
	});

const label = (i: ReturnType<typeof suggest>[number]) =>
	i.kind === "section"
		? `#${i.section}`
		: i.kind === "team"
			? i.team.name
			: i.kind === "member"
				? i.person.name
				: i.kind === "invite"
					? i.email
					: i.kind;

describe("inviteSuggestions", () => {
	test("an empty query lists people, then teams, with access holders last", () => {
		expect(suggest("").map(label)).toEqual([
			"#people",
			"Kenji Tanaka",
			"Maya Rivera",
			"Dev Okafor",
			"#teams",
			"Design",
		]);
	});

	test("members who already have access stay listed but can't be picked", () => {
		const items = suggest("k");
		expect(items.map(label)).toEqual(["#people", "Kenji Tanaka", "Dev Okafor"]);
		expect(items[2]).toMatchObject({ hasAccess: true });
		expect(pickableIndexes(items)).toEqual([1]);
	});

	test("the owner counts as having access", () => {
		expect(suggest("maya")[1]).toMatchObject({ hasAccess: true });
	});

	test("picks stay listed and are marked selected", () => {
		const items = suggest("kenji", {
			staged: [{ kind: "user", person: kenji }],
		});
		expect(items[1]).toMatchObject({ kind: "member", selected: true });
		expect(pickableIndexes(items)).toEqual([1]);
	});

	test("an address being typed offers completions, the org domain first", () => {
		const items = suggest("ana@");
		expect(items[0]).toEqual({ kind: "heading" });
		expect(items.slice(1).map(label)).toEqual([
			"ana@acme.dev",
			"ana@gmail.com",
		]);
	});

	test("completions narrow by the typed domain and skip existing members", () => {
		expect(
			suggest("dev@")
				.filter((i) => i.kind === "invite")
				.map(label),
		).toEqual(["dev@gmail.com"]);
		expect(suggest("ana@g").filter((i) => i.kind === "invite")).toHaveLength(1);
	});

	test("a full address becomes one invite under its own heading, marked when already invited", () => {
		expect(suggest("Ana@Globex.com")).toEqual([
			{ kind: "section", section: "invite" },
			{
				kind: "invite",
				email: "ana@globex.com",
				completion: false,
				invited: false,
				selected: false,
			},
		]);
		expect(suggest("sam@studio.design")[1]).toMatchObject({ invited: true });
	});

	test("a picked address stays listed while the query is empty", () => {
		expect(
			suggest("", {
				staged: [{ kind: "email", email: "ana@globex.com" }],
			}).slice(0, 2),
		).toEqual([
			{ kind: "section", section: "invite" },
			{
				kind: "invite",
				email: "ana@globex.com",
				completion: false,
				invited: false,
				selected: true,
			},
		]);
	});

	test("an address that can't be completed stays as a row that explains itself", () => {
		expect(suggest("sam@studio")).toEqual([
			{ kind: "section", section: "invite" },
			{ kind: "invalid", text: "sam@studio" },
		]);
	});

	test("without permission to invite, one row says so instead", () => {
		expect(suggest("ana@", { inviteNew: "admins-only" })).toEqual([
			{ kind: "blocked" },
		]);
	});

	test("no match and no address yet says nothing matched", () => {
		expect(suggest("zz z")).toEqual([{ kind: "empty" }]);
	});
});
