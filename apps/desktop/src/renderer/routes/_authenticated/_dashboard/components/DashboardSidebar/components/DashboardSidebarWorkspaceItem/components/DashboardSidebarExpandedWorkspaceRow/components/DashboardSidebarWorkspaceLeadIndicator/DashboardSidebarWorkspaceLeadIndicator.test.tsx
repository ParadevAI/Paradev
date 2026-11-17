import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { DashboardSidebarWorkspaceLeadIndicator } from "./DashboardSidebarWorkspaceLeadIndicator";

afterEach(cleanup);

function renderLead(
	props: Partial<Parameters<typeof DashboardSidebarWorkspaceLeadIndicator>[0]>,
) {
	return render(
		<DashboardSidebarWorkspaceLeadIndicator
			workspaceStatus={null}
			isCreatePending={false}
			pullRequestState={null}
			{...props}
		/>,
	).container;
}

test("live agent state outranks the pull request", () => {
	const working = renderLead({
		workspaceStatus: "working",
		pullRequestState: "open",
	});
	expect(working.querySelector(".text-emerald-500")).toBeNull();
	expect(working.querySelector("[data-lead]")?.getAttribute("data-lead")).toBe(
		"working",
	);
	cleanup();

	const needsInput = renderLead({
		workspaceStatus: "permission",
		pullRequestState: "open",
	});
	expect(needsInput.querySelector(".bg-yellow-500")).not.toBeNull();
	expect(needsInput.querySelector(".text-emerald-500")).toBeNull();
});

test("an idle row shows its pull request state, else a quiet dot", () => {
	expect(
		renderLead({ pullRequestState: "merged" }).querySelector(
			".text-purple-500",
		),
	).not.toBeNull();
	cleanup();

	const idle = renderLead({});
	expect(idle.querySelector("svg")).toBeNull();
	expect(idle.querySelector("span.rounded-full")?.className).toContain(
		"bg-muted-foreground/50",
	);
});

test("a dead or unborn sandbox outranks the agent and the PR", () => {
	const failed = renderLead({
		sandboxStatus: "failed",
		workspaceStatus: "working",
		pullRequestState: "open",
	});
	expect(failed.querySelector(".bg-red-500")).not.toBeNull();
	expect(failed.querySelector("[data-lead]")?.getAttribute("data-lead")).toBe(
		"failed",
	);
	cleanup();

	const provisioning = renderLead({
		sandboxStatus: "provisioning",
		pullRequestState: "open",
	});
	expect(
		provisioning.querySelector("[data-lead]")?.getAttribute("data-lead"),
	).toBe("creating");
	expect(provisioning.querySelector(".text-emerald-500")).toBeNull();
});
