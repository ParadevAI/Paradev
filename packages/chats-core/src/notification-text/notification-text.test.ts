import { describe, expect, test } from "bun:test";
import {
	NOTIFICATION_BODY_MAX,
	notificationText,
} from "./notification-text.ts";

const base = {
	senderName: "Nina",
	chatTitle: "Trip",
	isGroup: true,
	text: "hi",
};

describe("notification title", () => {
	test("a group reads sender · chat; a 1:1 the sender alone", () => {
		expect(notificationText(base).title).toBe("Nina · Trip");
		expect(notificationText({ ...base, isGroup: false }).title).toBe("Nina");
	});

	test("Dev's own notes have no sender", () => {
		expect(notificationText({ ...base, senderName: null }).title).toBe(
			"Dev · Trip",
		);
		expect(
			notificationText({ ...base, senderName: null, isGroup: false }).title,
		).toBe("Trip");
	});
});

describe("notification body", () => {
	test("cards read as one line: question, then task, then app", () => {
		expect(
			notificationText({
				...base,
				questionTitle: "Which **day**?",
				taskTitle: "x",
			}).body,
		).toBe("Asks: Which day?");
		expect(notificationText({ ...base, taskTitle: "Book flights" }).body).toBe(
			"Task: Book flights",
		);
		expect(notificationText({ ...base, appName: "Budget" }).body).toBe(
			"Sketch: Budget",
		);
	});

	test("a file card reads as its caption, or the file when it has none", () => {
		expect(
			notificationText({ ...base, text: "", fileName: "Itinerary" }).body,
		).toBe("File: Itinerary");
		expect(
			notificationText({
				...base,
				text: "Here's the **plan**",
				fileName: "Itinerary",
			}).body,
		).toBe("Here's the plan");
	});

	test("long text is cut with an ellipsis", () => {
		const body = notificationText({ ...base, text: "word ".repeat(100) }).body;
		expect(body.length).toBe(NOTIFICATION_BODY_MAX);
		expect(body.endsWith("…")).toBe(true);
	});
});

describe("voice notes", () => {
	const direct = { senderName: "Nina", chatTitle: "Nina", isGroup: false };
	test("say they're a voice note until their words are known, then the words", () => {
		expect(notificationText({ ...direct, text: "", voiceMs: 6_200 }).body).toBe(
			"🎤 Voice note (0:06)",
		);
		expect(
			notificationText({
				...direct,
				text: "Move my **3pm** to 4",
				voiceMs: 6_200,
			}).body,
		).toBe("🎤 Move my 3pm to 4");
	});
});
