import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { AgentMissingCard } from "./AgentMissingCard";

afterEach(cleanup);

const DETAIL = "claude was not found, so this chat cannot start.";

describe("AgentMissingCard", () => {
	test("replaces the raw error with an install offer and keeps it under Details", () => {
		render(
			<AgentMissingCard
				agent="claude"
				detail={DETAIL}
				otherAgents={[{ presetId: "codex", label: "Codex" }]}
				onUseAgent={() => {}}
				onRetry={() => {}}
			/>,
		);
		expect(screen.getByText("Claude Code isn't installed yet")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Install" })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Use another agent" }),
		).toBeTruthy();
		expect(screen.getByText("Details")).toBeTruthy();
		expect(screen.queryByText(/npm i -g/)).toBeNull();
	});

	test("offers no other agent when there is none", () => {
		render(
			<AgentMissingCard
				agent="codex"
				otherAgents={[]}
				onUseAgent={() => {}}
				onRetry={() => {}}
			/>,
		);
		expect(screen.getByText("Codex isn't installed yet")).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Use another agent" }),
		).toBeNull();
		expect(screen.queryByText("Details")).toBeNull();
	});

	test("offers Try again straight away when the agent was installed elsewhere", () => {
		render(
			<AgentMissingCard
				agent="claude"
				detail={DETAIL}
				installed
				otherAgents={[]}
				onUseAgent={() => {}}
				onRetry={() => {}}
			/>,
		);
		expect(screen.getByText("Claude Code is installed")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
		expect(screen.queryByText("Details")).toBeNull();
	});

	test("an install too old for chat offers an update, or Try again when it is the user's own", () => {
		const outdated = { version: "2.0.1", minVersion: "2.1.226" };
		render(
			<AgentMissingCard
				agent="claude"
				outdated={{ ...outdated, ownInstall: false }}
				otherAgents={[]}
				onUseAgent={() => {}}
				onRetry={() => {}}
			/>,
		);
		expect(
			screen.getByText("Claude Code 2.0.1 is too old for chat"),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Update" })).toBeTruthy();
		cleanup();

		render(
			<AgentMissingCard
				agent="claude"
				outdated={{ ...outdated, ownInstall: true }}
				otherAgents={[]}
				onUseAgent={() => {}}
				onRetry={() => {}}
			/>,
		);
		expect(screen.queryByRole("button", { name: "Update" })).toBeNull();
		expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
	});
});
