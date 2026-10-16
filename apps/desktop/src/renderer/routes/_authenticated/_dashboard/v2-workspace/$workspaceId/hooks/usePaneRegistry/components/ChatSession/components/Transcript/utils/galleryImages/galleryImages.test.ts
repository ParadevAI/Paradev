import { describe, expect, test } from "bun:test";
import type { TranscriptRow } from "../transcriptRows";
import { galleryImageId, galleryImages } from "./galleryImages";

const DIR = ".superset/attachments";

function userRow(id: string, text: string): TranscriptRow {
	return {
		kind: "item",
		key: `client-${id}`,
		groupStart: true,
		item: {
			id,
			kind: "user_message",
			clientId: `client-${id}`,
			startedAtMs: 0,
			content: [{ type: "text", text }],
		},
	};
}

function tool(id: string, paths: string[]) {
	return {
		id,
		kind: "tool_call" as const,
		startedAtMs: 0,
		title: "Read",
		toolName: "read_file",
		toolKind: "read" as const,
		status: "completed" as const,
		content: [],
		attachments: paths.map((path) => ({
			type: "image" as const,
			path,
			mimeType: "image/png",
		})),
	};
}

describe("galleryImages", () => {
	test("lists user and agent images in transcript order, across turns", () => {
		const rows: TranscriptRow[] = [
			userRow(
				"u1",
				`<attachment path="${DIR}/one.png" type="image/png" /> <attachment path="${DIR}/notes.pdf" type="application/pdf" /> look`,
			),
			{
				kind: "tool_run",
				key: "tools:t1:c1",
				groupStart: false,
				defaultCollapsed: true,
				items: [
					tool("c1", [`${DIR}/two.png`]),
					tool("c2", [`${DIR}/two.png`, `${DIR}/three.png`]),
				],
			},
			{
				kind: "item",
				key: "a1",
				groupStart: false,
				item: {
					id: "a1",
					kind: "agent_message",
					startedAtMs: 0,
					text: "here",
					attachments: [
						{ type: "image", path: `${DIR}/four.jpg`, mimeType: "image/jpeg" },
						{ type: "sticker" },
					],
				},
			},
			userRow("u2", `<attachment path="${DIR}/five.png" type="image/png" />`),
			{
				kind: "outbox",
				key: "pending",
				groupStart: true,
				entry: {
					commandId: "cmd-1",
					clientId: "pending",
					state: "queued",
					attempts: 0,
					lastError: null,
					content: [
						{
							type: "text",
							text: `<attachment path="${DIR}/six.png" type="image/png" />`,
						},
					],
				},
			},
		];
		expect(galleryImages(rows)).toEqual([
			{
				id: galleryImageId("client-u1", `${DIR}/one.png`),
				path: `${DIR}/one.png`,
				mimeType: "image/png",
				filename: "one.png",
				alt: undefined,
			},
			{
				id: galleryImageId("c1", `${DIR}/two.png`),
				path: `${DIR}/two.png`,
				mimeType: "image/png",
				filename: "two.png",
				alt: undefined,
			},
			{
				id: galleryImageId("c2", `${DIR}/three.png`),
				path: `${DIR}/three.png`,
				mimeType: "image/png",
				filename: "three.png",
				alt: undefined,
			},
			{
				id: galleryImageId("a1", `${DIR}/four.jpg`),
				path: `${DIR}/four.jpg`,
				mimeType: "image/jpeg",
				filename: "four.jpg",
				alt: undefined,
			},
			{
				id: galleryImageId("client-u2", `${DIR}/five.png`),
				path: `${DIR}/five.png`,
				mimeType: "image/png",
				filename: "five.png",
				alt: undefined,
			},
			{
				id: galleryImageId("pending", `${DIR}/six.png`),
				path: `${DIR}/six.png`,
				mimeType: "image/png",
				filename: "six.png",
				alt: undefined,
			},
		]);
	});

	test("skips rows without images and attachments that are not images", () => {
		const rows: TranscriptRow[] = [
			{
				kind: "working",
				key: "working:t1",
				groupStart: true,
				startedAtMs: 0,
				completedAtMs: 1,
				running: false,
			},
			userRow(
				"u1",
				`<attachment path="${DIR}/notes.pdf" type="application/pdf" />`,
			),
			userRow("u2", `<attachment path="${DIR}/untyped.png" />`),
			{
				kind: "turn_status",
				key: "status:t1",
				groupStart: false,
				status: "failed",
				message: undefined,
			},
		];
		expect(galleryImages(rows)).toEqual([]);
	});
});
