import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SetupStepContinue } from "./SetupStepContinue";

afterEach(cleanup);

function openSkipConfirm(props: { gitMissing: boolean; ghReady: boolean }) {
	const onContinue = mock(() => {});
	render(<SetupStepContinue {...props} onContinue={onContinue} />);
	fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
	return onContinue;
}

describe("SetupStepContinue", () => {
	test("Git missing: says projects need Git and the next screens offer it", () => {
		for (const ghReady of [false, true]) {
			openSkipConfirm({ gitMissing: true, ghReady });
			expect(screen.getByText("Skip Git for now?")).toBeTruthy();
			expect(
				screen.getByText(
					"You can't add a project until Git is installed. The next screens will offer it again.",
				),
			).toBeTruthy();
			cleanup();
		}
	});

	test("only GitHub missing: keeps the GitHub copy, and skipping continues", () => {
		const onContinue = openSkipConfirm({ gitMissing: false, ghReady: false });
		expect(screen.getByText("Skip GitHub for now?")).toBeTruthy();
		expect(screen.getByText(/You can still clone public repos/)).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Go back" }));
		expect(onContinue).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
		fireEvent.click(screen.getByRole("button", { name: "Skip" }));
		expect(onContinue).toHaveBeenCalledTimes(1);
	});

	test("nothing missing: Continue without asking", () => {
		const onContinue = mock(() => {});
		render(
			<SetupStepContinue gitMissing={false} ghReady onContinue={onContinue} />,
		);
		expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Continue" }));
		expect(onContinue).toHaveBeenCalledTimes(1);
	});
});
