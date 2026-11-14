import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type { WorkspaceCheckout } from "../../../../state/activeRepositoryStore";
import { CheckoutFailureNotice } from "./CheckoutFailureNotice";

function checkout(
	name: string,
	boxCheckout: WorkspaceCheckout["boxCheckout"],
): WorkspaceCheckout {
	return {
		repositoryId: `repo-${name}`,
		name,
		isPrimary: false,
		path: `/workspace/${name}`,
		branch: "superset/moved",
		headSha: null,
		upstream: null,
		pullRequestId: null,
		boxCheckout,
	};
}

afterEach(cleanup);

describe("CheckoutFailureNotice", () => {
	test("names each repository the box could not check out and why", () => {
		const view = render(
			<CheckoutFailureNotice
				checkouts={[
					checkout("api", {
						state: "failed",
						reason: "base_missing",
						baseBranch: "superset/moved",
					}),
					checkout("web", { state: "failed", reason: "clone_failed" }),
					checkout("docs", undefined),
				]}
				onDismiss={() => {}}
			/>,
		);
		const text = view.container.textContent ?? "";
		expect(text).toContain(
			"Couldn't check out api: its branch superset/moved is not on the remote.",
		);
		expect(text).toContain("Couldn't clone web.");
		expect(text).not.toContain("docs");
	});
});
