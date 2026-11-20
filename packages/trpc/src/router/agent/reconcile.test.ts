import { describe, expect, test } from "bun:test";
import { ServiceError, WorkflowNotFoundError } from "@temporalio/client";
import { workflowState } from "./reconcile";

const failingDescribe = (error: Error) => ({
	describe: () => Promise.reject(error),
	query: () => Promise.reject(new Error("not asked")),
});

describe("workflowState", () => {
	test("a session workflow Temporal does not know is lost", async () => {
		const workflow = failingDescribe(
			new WorkflowNotFoundError(
				"Workflow not found",
				"agent-session-s1",
				undefined,
			),
		);

		expect(await workflowState(workflow, "t1")).toBe("lost");
	});

	test("a describe that fails for another reason does not make the turn lost", async () => {
		const workflow = failingDescribe(
			new ServiceError("Failed to describe workflow"),
		);

		expect(await workflowState(workflow, "t1")).toBe("healthy");
	});
});
