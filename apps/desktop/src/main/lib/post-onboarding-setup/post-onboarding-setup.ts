export type PostOnboardingStep = readonly [label: string, run: () => void];

export interface PostOnboardingSetup {
	setSteps(steps: readonly PostOnboardingStep[]): void;
	request(): void;
}

/**
 * Holds the boot work that touches the user's machine outside the app's own
 * data (system permission prompts, other tools' config dirs) until the
 * renderer reports a signed-in, onboarded user. Runs at most once per process.
 */
export function createPostOnboardingSetup(
	log: (message: string, error: unknown) => void = (message, error) =>
		console.error(message, error),
): PostOnboardingSetup {
	let steps: readonly PostOnboardingStep[] | null = null;
	let requested = false;
	let ran = false;

	const runIfReady = () => {
		if (ran || !requested || !steps) return;
		ran = true;
		for (const [label, run] of steps) {
			try {
				run();
			} catch (error) {
				log(`[post-onboarding-setup] ${label} failed:`, error);
			}
		}
	};

	return {
		setSteps(next) {
			steps = next;
			runIfReady();
		},
		request() {
			requested = true;
			runIfReady();
		},
	};
}

export const postOnboardingSetup = createPostOnboardingSetup();
