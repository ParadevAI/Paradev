import { describe, expect, test } from "bun:test";
import { runSlashCommand, slashEntries, typedCommand } from "./slashCommands";

const LABELS = {
	invite: "Invite someone to this channel",
	topic: "Edit this channel’s topic",
	away: "Set yourself as away",
};

describe("typedCommand", () => {
	test("is the name while it is still being typed", () => {
		expect(typedCommand("/")).toBe("");
		expect(typedCommand("/shr")).toBe("shr");
		expect(typedCommand("/shrug hi")).toBeNull();
		expect(typedCommand("hello /shrug")).toBeNull();
	});
});

describe("runSlashCommand", () => {
	test("shrug posts the message with the shrug appended", () => {
		expect(runSlashCommand("/shrug no idea")).toEqual({
			kind: "post",
			text: "no idea ¯\\_(ツ)_/¯",
		});
	});

	test("invite takes the mentioned person", () => {
		expect(runSlashCommand("/invite <@U0AVERY4C1N>")).toEqual({
			kind: "action",
			actionId: "invite",
			input: "U0AVERY4C1N",
		});
		expect(runSlashCommand("/invite")).toEqual({
			kind: "invalid",
			reason: "needs-argument",
		});
	});

	test("topic, away and active become card actions", () => {
		expect(runSlashCommand("/topic Ship it")).toEqual({
			kind: "action",
			actionId: "set_topic",
			input: "Ship it",
		});
		expect(runSlashCommand("/away")).toMatchObject({ input: "away" });
		expect(runSlashCommand("/active")).toMatchObject({ input: "auto" });
	});

	test("Slack's commands that only work inside Slack are refused with their reason", () => {
		expect(runSlashCommand("/remind me later")).toEqual({
			kind: "invalid",
			reason: "permission",
		});
		expect(runSlashCommand("/me waves")).toEqual({
			kind: "invalid",
			reason: "thread",
		});
		expect(runSlashCommand("/who")).toEqual({
			kind: "invalid",
			reason: "slack-app",
		});
	});

	test("only a leading slash is a command", () => {
		expect(runSlashCommand("see /shrug")).toBeNull();
		expect(runSlashCommand("/nope")).toEqual({
			kind: "invalid",
			reason: "unknown",
		});
	});
});

describe("slashEntries", () => {
	test("lists commands by name prefix, then shortcuts by any word", () => {
		const names = (q: string) =>
			slashEntries(q, LABELS).map((e) =>
				e.kind === "command" ? `/${e.name}` : e.shortcut,
			);
		expect(names("re")).toEqual(["/remind", "/remove"]);
		expect(names("s")).toEqual(["/shrug", "invite", "away"]);
		expect(names("inv")).toEqual(["invite"]);
		expect(names("topic")).toEqual(["topic"]);
		expect(names("").length).toBe(13);
	});
});
