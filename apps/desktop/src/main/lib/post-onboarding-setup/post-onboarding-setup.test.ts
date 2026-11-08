import { describe, expect, test } from "bun:test";
import { createPostOnboardingSetup } from "./post-onboarding-setup";

describe("createPostOnboardingSetup", () => {
	test("does nothing until the renderer requests it", () => {
		const ran: string[] = [];
		const setup = createPostOnboardingSetup();
		setup.setSteps([["hooks", () => ran.push("hooks")]]);
		expect(ran).toEqual([]);

		setup.request();
		expect(ran).toEqual(["hooks"]);
	});

	test("a request that arrives before the steps runs them once they are set", () => {
		const ran: string[] = [];
		const setup = createPostOnboardingSetup();
		setup.request();
		setup.setSteps([["hooks", () => ran.push("hooks")]]);
		expect(ran).toEqual(["hooks"]);
	});

	test("runs once per process, however many windows request it", () => {
		let count = 0;
		const setup = createPostOnboardingSetup();
		setup.setSteps([["hooks", () => count++]]);
		setup.request();
		setup.request();
		expect(count).toBe(1);
	});

	test("a failing step does not stop the steps after it", () => {
		const ran: string[] = [];
		const logged: string[] = [];
		const setup = createPostOnboardingSetup((message) => logged.push(message));
		setup.setSteps([
			[
				"notifications",
				() => {
					throw new Error("denied");
				},
			],
			["hooks", () => ran.push("hooks")],
		]);
		setup.request();
		expect(ran).toEqual(["hooks"]);
		expect(logged).toEqual(["[post-onboarding-setup] notifications failed:"]);
	});
});
