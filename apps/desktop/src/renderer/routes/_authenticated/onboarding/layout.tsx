import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { SUPPORTED_LOCALES } from "@superset/i18n";
import {
	createFileRoute,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { Redirect } from "renderer/components/Redirect";
import { SupersetLogo } from "renderer/components/SupersetLogo";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { WindowControlsInset } from "../_dashboard/components/WindowControlsInset";
import { OnboardingHelpLinks } from "./components/OnboardingHelpLinks";
import { OnboardingLanguagePicker } from "./components/OnboardingLanguagePicker";
import { OnboardingNavigation } from "./components/OnboardingNavigation";

export const Route = createFileRoute("/_authenticated/onboarding")({
	component: OnboardingFlowLayout,
});

const rootRedirect = <Redirect to="/" replace />;

const SETUP_STEP = {
	path: "/onboarding",
	match: (p: string) => p === "/onboarding",
	title: msg({ message: "Connect GitHub" }),
	subtitle: msg({
		message:
			"Paradev uses the GitHub CLI to clone repos and open pull requests. You can also do this later.",
	}),
};

const PROJECT_STEP = {
	path: "/onboarding/project",
	match: (p: string) => p === "/onboarding/project",
	title: msg({ message: "Add your first project" }),
	subtitle: msg({
		message: "Open a folder you already work in. You can add more later.",
	}),
};

const projectRedirect = <Redirect to="/onboarding/project" replace />;

function OnboardingFlowLayout() {
	const { data: session, isPending } = authClient.useSession();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const location = useLocation();
	const navigate = useNavigate();
	const { i18n } = useLingui();
	const { data: ghStatus, isPending: isPendingGh } =
		electronTrpc.system.detectGhCli.useQuery();
	const ghReady =
		ghStatus?.installed === true && ghStatus.authenticated === true;

	// Finishing flips onboardedAt while this layout is mounted. The project
	// step navigates on its own then; a redirect here would race it.
	const [onboardedOnArrival, setOnboardedOnArrival] = useState<boolean | null>(
		null,
	);
	if (!isPending && onboardedOnArrival === null) {
		setOnboardedOnArrival(Boolean(session?.user?.onboardedAt));
	}
	const [ghReadyOnArrival, setGhReadyOnArrival] = useState<boolean | null>(
		null,
	);
	if (!isPendingGh && ghReadyOnArrival === null) {
		setGhReadyOnArrival(ghReady);
	}

	if (isPending) return null;
	if (onboardedOnArrival) {
		return rootRedirect;
	}

	// Nothing to set up when GitHub CLI already works, so that step drops out.
	// Decided on arrival: signing in mid-step must not unmount its own dialog.
	const steps = ghReadyOnArrival ? [PROJECT_STEP] : [SETUP_STEP, PROJECT_STEP];
	if (SETUP_STEP.match(location.pathname)) {
		if (ghReadyOnArrival === null) return null;
		if (ghReadyOnArrival) return projectRedirect;
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
	// added, so only the GitHub step gets a footer action
	const handleContinue =
		currentStep === SETUP_STEP
			? () => navigate({ to: PROJECT_STEP.path })
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
							<Outlet />
						</div>
						<OnboardingNavigation
							onBack={isFirstStep ? null : handleBack}
							onContinue={handleContinue}
						/>
					</div>
				) : (
					<Outlet />
				)}
			</div>
		</div>
	);
}
