import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { App } from "../model/model.ts";
import {
	appCardMeta,
	appChangeDev,
	appChip,
	appIdFromUrl,
	appLink,
	appMaker,
	findSketches,
	sketchCall,
	sketchPicture,
	sketchPictureSize,
	splitAppLinks,
	timeAgo,
} from "./app-cards.ts";

const ID = "57c3cb11-d29f-4b2a-9165-3433a5727a5e";
const LOCAL = `http://${ID}.localhost:3002/_v/3/`;
const PROD = `https://${ID}.devusercontent.com/_v/1/`;

const app = (version: number | null): App => ({
	id: ID,
	chatId: "g",
	name: "Packing list",
	description: "",
	color: 2,
	status: version ? "live" : "draft",
	version: version
		? { number: version, label: "", createdAt: "2026-10-12T09:00:00.000Z" }
		: null,
	url: version ? LOCAL : null,
	creatorDevId: null,
	saved: true,
	createdAt: "2026-10-12T09:00:00.000Z",
});

function state(): ChatState {
	return {
		meId: "u1",
		members: { u1: { id: "u1", name: "Harshith" } },
		devs: {
			wren: {
				id: "wren",
				kind: "group",
				name: "Wren",
				color: "#2F6F6A",
				ownerId: null,
				description: "",
			},
			juniper: {
				id: "juniper",
				kind: "personal",
				name: "Juniper",
				color: "#F2B23E",
				ownerId: "u1",
				description: "",
			},
			gone: {
				id: "gone",
				kind: "custom",
				name: "Gone",
				color: "#F2B23E",
				ownerId: "u1",
				description: "",
			},
		},
		chats: [
			{
				id: "g",
				title: "Goa",
				kind: "group",
				memberIds: ["u1"],
				ownerIds: ["u1"],
				devIds: ["juniper", "wren"],
			},
			{
				id: "dm",
				title: "Juniper",
				kind: "direct",
				memberIds: ["u1"],
				ownerIds: ["u1"],
				devIds: ["juniper"],
			},
		],
		messages: [
			{
				id: "m1",
				chatId: "g",
				authorId: null,
				authorDevId: "juniper",
				text: "Published Packing list",
				at: "2026-10-12T09:00:00.000Z",
				appId: ID,
				appVersion: 1,
			},
			{
				id: "m2",
				chatId: "g",
				authorId: "u1",
				text: "Shared Packing list",
				at: "2026-10-12T09:05:00.000Z",
				appId: ID,
				appVersion: 1,
			},
		],
		tasks: [],
		apps: [app(3)],
	};
}

describe("app links", () => {
	test("app-host URLs, local, production and preview, name their app; other URLs don't", () => {
		expect(appIdFromUrl(LOCAL)).toBe(ID);
		expect(appIdFromUrl(PROD)).toBe(ID);
		expect(
			appIdFromUrl(`https://${ID.toUpperCase()}.preview.devusercontent.com`),
		).toBe(ID);
		expect(appIdFromUrl(`http://${ID}.localhost:3002`)).toBe(ID);
		expect(appIdFromUrl("https://devusercontent.com/x")).toBeNull();
		expect(appIdFromUrl(`https://${ID}.example.com/`)).toBeNull();
		expect(
			appIdFromUrl(`https://${ID}.devusercontent.com.evil.dev/`),
		).toBeNull();
	});

	test("a bare URL becomes a chip, leaving the sentence's punctuation", () => {
		expect(splitAppLinks(`It's live: ${PROD}. Have a look`)).toEqual([
			{ type: "text", text: "It's live: " },
			{ type: "app", appId: ID, url: PROD },
			{ type: "text", text: ". Have a look" },
		]);
	});

	test("markdown links and autolinks become chips, label and brackets included", () => {
		expect(splitAppLinks(`Open [Packing list](${LOCAL}) or <${PROD}>`)).toEqual(
			[
				{ type: "text", text: "Open " },
				{ type: "app", appId: ID, url: LOCAL },
				{ type: "text", text: " or " },
				{ type: "app", appId: ID, url: PROD },
			],
		);
	});

	test("text without app links is one segment; other links stay text", () => {
		expect(splitAppLinks("see https://example.com/a")).toEqual([
			{ type: "text", text: "see https://example.com/a" },
		]);
		expect(splitAppLinks("")).toEqual([]);
	});

	test("a chip names the app, or says App for one this user can't see", () => {
		expect(appChip(state(), ID)).toEqual({ app: app(3), name: "Packing list" });
		expect(appChip(state(), "00000000-0000-4000-8000-000000000000")).toEqual({
			app: undefined,
			name: "Sketch",
		});
	});
});

describe("app cards", () => {
	test("the copied link is the app's origin, which serves whatever version is current", () => {
		expect(appLink(app(3))).toBe(`http://${ID}.localhost:3002/`);
		expect(appLink(app(null))).toBeNull();
	});

	test("the maker is the Dev whose card is newest; people's shares don't count", () => {
		expect(appMaker(state(), ID)?.id).toBe("juniper");
		expect(appMaker({ ...state(), messages: [] }, ID)).toBeUndefined();
	});

	test("asking for a change goes to the maker while it can be mentioned in the chat, else the chat's own Dev", () => {
		const s = state();
		expect(appChangeDev(s, s.chats[0]!, ID)?.id).toBe("juniper");
		const madeByWren = {
			...s,
			messages: [{ ...s.messages[0]!, authorDevId: "wren" }],
		};
		expect(appChangeDev(madeByWren, s.chats[0]!, ID)?.id).toBe("wren");
		const madeByGone = {
			...s,
			messages: [{ ...s.messages[0]!, authorDevId: "gone" }],
		};
		expect(appChangeDev(madeByGone, s.chats[0]!, ID)?.id).toBe("wren");
		expect(appChangeDev(s, s.chats[1]!, ID)?.id).toBe("juniper");
		expect(appChangeDev({ ...s, messages: [] }, s.chats[1]!, ID)?.id).toBe(
			"juniper",
		);
	});

	test("time ago", () => {
		const now = new Date("2026-10-12T12:00:00");
		expect(timeAgo(new Date("2026-10-12T11:59:30"), now)).toBe("just now");
		expect(timeAgo(new Date("2026-10-12T11:55:00"), now)).toBe("5 min ago");
		expect(timeAgo(new Date("2026-10-12T09:00:00"), now)).toBe("3 hr ago");
		expect(timeAgo(new Date("2026-10-03T09:00:00"), now)).toBe(
			new Date("2026-10-03T09:00:00").toLocaleDateString(undefined, {
				day: "numeric",
				month: "short",
			}),
		);
	});

	test("a sketch's picture is on its own origin, per version and theme; none for a draft or a current version without one", () => {
		const pictured = (n: number): App => ({
			...app(n),
			version: {
				number: n,
				label: "",
				createdAt: "",
				preview: { width: 640, height: 420 },
			},
		});
		expect(sketchPicture(pictured(3), 3, "dark")).toBe(
			`http://${ID}.localhost:3002/_dev/picture/3/dark`,
		);
		expect(sketchPicture(app(3), 3, "light")).toBeNull();
		expect(sketchPicture(app(3), 1, "light")).toBe(
			`http://${ID}.localhost:3002/_dev/picture/1/light`,
		);
		expect(sketchPicture(app(null), 1, "light")).toBeNull();
	});

	test("a sketch's picture size is known for the current version only", () => {
		const pictured: App = {
			...app(2),
			version: {
				number: 2,
				label: "",
				createdAt: "",
				preview: { width: 640, height: 300 },
			},
		};
		expect(sketchPictureSize(pictured, 2)).toEqual({ width: 640, height: 300 });
		expect(sketchPictureSize(pictured, 1)).toBeNull();
		expect(sketchPictureSize(app(2), 2)).toBeNull();
	});

	test("a sketch call gives its title and height; while it's still being written, no title and the default height", () => {
		expect(
			sketchCall({ title: " Trip budget ", html: "<p>", height: 300 }),
		).toEqual({ title: "Trip budget", width: 640, height: 300 });
		expect(sketchCall(null)).toEqual({ title: null, width: 640, height: 420 });
		expect(sketchCall({ title: "" })).toEqual({
			title: null,
			width: 640,
			height: 420,
		});
	});

	test("a card says the version it announced and, once the app moves on, the one on show", () => {
		const now = new Date("2026-10-12T09:00:20.000Z");
		expect(
			appCardMeta(
				app(1),
				{ appVersion: 1, at: "2026-10-12T09:00:00.000Z" },
				now,
			),
		).toBe("v1 · published just now");
		expect(
			appCardMeta(
				app(3),
				{ appVersion: 3, at: "2026-10-12T09:00:00.000Z" },
				now,
			),
		).toBe("v3 · updated just now");
		expect(
			appCardMeta(
				app(3),
				{ appVersion: 1, at: "2026-10-12T09:00:00.000Z" },
				now,
			),
		).toBe("v1 · published just now · now v3");
		expect(appCardMeta(app(2), { at: "2026-10-12T09:00:00.000Z" }, now)).toBe(
			"v2 · updated just now",
		);
		expect(
			appCardMeta(app(null), { at: "2026-10-12T09:00:00.000Z" }, now),
		).toBe("Draft");
		expect(
			appCardMeta(
				{ ...app(1), saved: false },
				{ appVersion: 1, at: "2026-10-12T09:00:00.000Z" },
				now,
			),
		).toBe("v1 · sketched just now");
		// Shared later: the current version's own publish time, not the share's.
		expect(
			appCardMeta(
				app(3),
				{ appVersion: 3, at: "2026-10-12T09:00:15.000Z" },
				new Date("2026-10-12T09:10:00.000Z"),
			),
		).toBe("v3 · updated 10 min ago");
	});
});

describe("findSketches", () => {
	const saved = (
		id: string,
		chatId: string,
		createdAt: string,
		versionAt?: string,
	) =>
		({
			id,
			chatId,
			name: id,
			saved: true,
			createdAt,
			status: "live",
			version: versionAt
				? { number: 2, label: "", createdAt: versionAt }
				: null,
		}) as unknown as App;
	const mine = {
		meId: "me",
		members: {},
		devs: {},
		chats: [
			{
				id: "trip",
				kind: "group",
				title: "Goa trip",
				memberIds: ["me"],
				devIds: [],
			},
			{
				id: "home",
				kind: "group",
				title: "Home",
				memberIds: ["me"],
				devIds: [],
			},
			{
				id: "theirs",
				kind: "group",
				title: "Not mine",
				memberIds: ["bob"],
				devIds: [],
			},
		],
		apps: [
			saved("Budget", "trip", "2026-10-01", "2026-10-09"),
			saved("Itinerary", "trip", "2026-10-05"),
			saved("Chore rota", "home", "2026-10-03"),
			saved("Hidden", "theirs", "2026-10-10"),
			{ ...saved("Loose", "trip", "2026-10-11"), saved: false },
		],
	} as unknown as ChatState;

	test("lists your saved sketches, the last changed first", () => {
		expect(findSketches(mine, "").map((a) => a.id)).toEqual([
			"Budget",
			"Itinerary",
			"Chore rota",
		]);
	});

	test("narrows by every word, in the name or the chat's title", () => {
		expect(findSketches(mine, "goa").map((a) => a.id)).toEqual([
			"Budget",
			"Itinerary",
		]);
		expect(findSketches(mine, "  GOA  bud ").map((a) => a.id)).toEqual([
			"Budget",
		]);
		expect(findSketches(mine, "rota home").map((a) => a.id)).toEqual([
			"Chore rota",
		]);
		expect(findSketches(mine, "nothing")).toEqual([]);
	});

	test("all: every sketch in your chats, saved or not", () => {
		expect(findSketches(mine, "", "all").map((a) => a.id)).toEqual([
			"Loose",
			"Budget",
			"Itinerary",
			"Chore rota",
		]);
		expect(findSketches(mine, "loose", "all").map((a) => a.id)).toEqual([
			"Loose",
		]);
	});
});
