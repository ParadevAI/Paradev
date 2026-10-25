import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { WorkingFor } from "./WorkingFor";

afterEach(cleanup);

test("a finished turn with no measurable time shows no line", () => {
	const view = render(<WorkingFor completedAtMs={5} startedAtMs={5} />);
	expect(view.container.firstChild).toBeNull();
});

test("a finished turn that took time still says how long", () => {
	const view = render(<WorkingFor completedAtMs={8000} startedAtMs={0} />);
	expect(view.container.firstChild).not.toBeNull();
});

test("a finished turn with a toggle keeps it reachable", () => {
	const view = render(
		<WorkingFor completedAtMs={5} onToggle={() => {}} startedAtMs={5} />,
	);
	expect(view.getByRole("button")).toBeTruthy();
});
