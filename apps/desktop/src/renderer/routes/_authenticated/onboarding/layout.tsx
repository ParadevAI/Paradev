import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { SUPPORTED_LOCALES } from "@superset/i18n";
import {
	createFileRoute,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Redirect } from "renderer/components/Redirect";
import { SupersetLogo } from "renderer/components/SupersetLogo";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { WindowControlsInset } from "../_dashboard/components/WindowControlsInset";
import { useOnboardingRestartStore } from "../stores/onboardingRestartStore";
import { OnboardingHelpLinks } from "./components/OnboardingHelpLinks";
import { OnboardingLanguagePicker } from "./components/OnboardingLanguagePicker";
import { OnboardingNavigation } from "./components/OnboardingNavigation";
import { SetupStepContinue } from "./components/SetupStepContinue";
import { SetupStepRowsProvider } from "./providers/SetupStepRowsProvider";
import { useAgentModeStore } from "./stores/agentModeStore";
import {
	needsSetupStep,
	type SetupStepRows,
	setupStepRows,
} from "./utils/setupStepRows";

export const Route = createFileRoute("/_authenticated/onboarding")({
	component: OnboardingFlowLayout,
});

const rootRedirect = <Redirect to="/" replace />;

const SETUP_STEP = {
	path: "/onboarding",
	match: (p: string) => p === "/onboarding",
	title: msg({ message: "Set up Git and GitHub" }),
	subtitle: msg({
		message:
			"Paradev uses Git and the GitHub CLI to clone repos and open pull requests. You can also do this later.",
	}),
};

const MODE_STEP = {
	path: "/onboarding/mode",
	match: (p: string) => p === "/onboarding/mode",
	title: msg({ message: "How do you want to work?" }),
	subtitle: msg({ message: "You can change this later in Settings." }),
};

const PROJECT_STEP = {
	path: "/onboarding/project",
	match: (p: string) => p === "/onboarding/project",
	title: msg({ message: "Add your first project" }),
	subtitle: msg({
		message: "Open a folder you already work in. You can add more later.",
	}),
};

const modeRedirect = <Redirect to="/onboarding/mode" replace />;

function OnboardingFlowLayout() {
	const { data: session, isPending } = authClient.useSession();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const location = useLocation();
	const navigate = useNavigate();
	const { i18n } = useLingui();
	const restarting = useOnboardingRestartStore((s) => s.restarting);
	useEffect(
		() => () => {
			useAgentModeStore.getState().reset();
			useOnboardingRestartStore.getState().end();
		},
		[],
	);
	const { data: ghStatus, isPending: isPendingGh } =
		electronTrpc.system.detectGhCli.useQuery();
	const { data: gitStatus, isPending: isPendingGit } =
		electronTrpc.system.detectGit.useQuery();
	const ghReady =
		ghStatus?.installed === true && ghStatus.authenticated === true;
	const gitMissing = gitStatus?.installed === false;

	// Finishing flips onboardedAt while this layout is mounted. The project
	// step navigates on its own then; a redirect here would race it.
	const [onboardedOnArrival, setOnboardedOnArrival] = useState<boolean | null>(
		null,
	);
	if (!isPending && onboardedOnArrival === null) {
		setOnboardedOnArrival(Boolean(session?.user?.onboardedAt));
	}
	// Decided on arrival: a row that gets fixed mid-step stays and shows it,
	// and signing in must not unmount its own dialog.
	const [rowsOnArrival, setRowsOnArrival] = useState<SetupStepRows | null>(
		null,
	);
	if (!isPendingGh && !isPendingGit && platform && rowsOnArrival === null) {
		setRowsOnArrival(setupStepRows({ git: gitStatus, gh: ghStatus, platform }));
	}
	const setupNeeded = rowsOnArrival !== null && needsSetupStep(rowsOnArrival);

	if (isPending) return null;
	if (onboardedOnArrival && !restarting) {
		return rootRedirect;
	}

	const steps = setupNeeded
		? [SETUP_STEP, MODE_STEP, PROJECT_STEP]
		: [MODE_STEP, PROJECT_STEP];
	if (SETUP_STEP.match(location.pathname)) {
		if (rowsOnArrival === null) return null;
		if (!setupNeeded) return modeRedirect;
	}

	const currentStepIdx = steps.findIndex((s) => s.match(location.pathname));
	const isOnMainStep = currentStepIdx >= 0;
	const isFirstStep = currentStepIdx === 0;
	const currentStep = isOnMainStep ? steps[currentStepIdx] : null;

	const handleBack = () => {
		if (currentStepIdx <= 0) return;
		const target = steps[currentStepIdx - 1];
		if (!target) return;
		navigate({ to: target.path });
	};

	// The project step finishes onboarding itself the moment a project is
	// added, so the last step has no footer action unless this is a restart
	const nextStep = isOnMainStep ? steps[currentStepIdx + 1] : undefined;
	const handleContinue = nextStep
		? () => navigate({ to: nextStep.path })
		: restarting && isOnMainStep
			? () => navigate({ to: "/" })
			: null;

	return (
		<div className="flex h-full w-full flex-col bg-background">
			<div
				className="drag flex h-12 w-full shrink-0 items-center justify-end pr-3"
				style={{ paddingLeft: isMac ? "88px" : "16px" }}
			>
				{SUPPORTED_LOCALES.length > 1 && <OnboardingLanguagePicker />}
				<OnboardingHelpLinks />
				<WindowControlsInset />
			</div>
			<div className="flex-1 overflow-auto">
				{currentStep ? (
					<div className="mx-auto flex min-h-full w-full max-w-[744px] flex-col px-8 pb-10">
						<SupersetLogo className="mt-6 h-4 w-auto self-start" />
						<div className="flex flex-1 flex-col justify-center gap-6 py-10">
							<div>
								<h1 className="font-medium text-foreground text-xl">
									{i18n._(currentStep.title)}
								</h1>
								<p className="mt-1.5 text-muted-foreground text-sm">
									{i18n._(currentStep.subtitle)}
								</p>
							</div>
							<SetupStepRowsProvider
								rows={rowsOnArrival ?? { git: false, gitHub: false }}
							>
								<Outlet />
							</SetupStepRowsProvider>
						</div>
						<OnboardingNavigation
							onBack={
								!isFirstStep
									? handleBack
									: restarting
										? () => navigate({ to: "/settings/experimental" })
										: null
							}
							onContinue={handleContinue}
							continueButton={
								currentStep === SETUP_STEP && handleContinue ? (
									<SetupStepContinue
										gitMissing={gitMissing}
										ghReady={ghReady || rowsOnArrival?.gitHub === false}
										onContinue={handleContinue}
									/>
								) : undefined
							}
						/>
					</div>
				) : (
					<Outlet />
				)}
			</div>
		</div>
	);
}
