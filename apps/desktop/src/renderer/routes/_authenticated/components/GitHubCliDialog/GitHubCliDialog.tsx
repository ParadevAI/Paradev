import { Trans } from "@lingui/react/macro";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Spinner } from "@superset/ui/spinner";
import { useEffect, useRef, useState } from "react";
import { LuCheck } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { InstallStep } from "./components/InstallStep";
import { SignInStep } from "./components/SignInStep";
import { StepError } from "./components/StepError";

export type GitHubCliDialogStart = "install" | "auth";

type Step = GitHubCliDialogStart | "checking" | "success" | "not-signed-in";

const SUCCESS_CLOSE_MS = 1500;

interface GitHubCliDialogProps {
	open: boolean;
	startWith: GitHubCliDialogStart;
	onOpenChange: (open: boolean) => void;
}

export function GitHubCliDialog({
	open,
	startWith,
	onOpenChange,
}: GitHubCliDialogProps) {
	const utils = electronTrpc.useUtils();
	const [step, setStep] = useState<Step>(startWith);
	const [attempt, setAttempt] = useState(0);
	const [wasOpen, setWasOpen] = useState(open);
	const closeTimerRef = useRef<number | null>(null);

	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) setStep(startWith);
	}

	useEffect(() => {
		if (!open) return;
		return () => {
			if (closeTimerRef.current !== null) {
				window.clearTimeout(closeTimerRef.current);
				closeTimerRef.current = null;
			}
		};
	}, [open]);

	const recheck = async (ifSignedOut: Step) => {
		setStep("checking");
		await utils.system.detectGhCli.invalidate();
		const status = await utils.system.detectGhCli.fetch().catch(() => null);
		if (status?.installed && status.authenticated) {
			setStep("success");
			closeTimerRef.current = window.setTimeout(
				() => onOpenChange(false),
				SUCCESS_CLOSE_MS,
			);
		} else {
			setStep(ifSignedOut);
		}
	};

	const checkInstalled = async () => {
		await utils.system.detectGhCli.invalidate();
		const status = await utils.system.detectGhCli.fetch().catch(() => null);
		if (!status?.installed) return false;
		void recheck("auth");
		return true;
	};

	const retry = (target: Step) => {
		setStep(target);
		setAttempt((prev) => prev + 1);
	};

	return (
		<Dialog open={open} modal onOpenChange={onOpenChange}>
			<DialogContent
				className="gap-4 sm:max-w-[440px]"
				aria-describedby={undefined}
				onInteractOutside={(event) => event.preventDefault()}
				onFocusOutside={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>
						{step === "install" ? (
							<Trans>Install GitHub CLI</Trans>
						) : (
							<Trans>Sign in to GitHub</Trans>
						)}
					</DialogTitle>
				</DialogHeader>
				{step === "install" && (
					<InstallStep
						key={attempt}
						onInstalled={() => void recheck("auth")}
						onRetry={() => retry("install")}
						onCheckAgain={checkInstalled}
					/>
				)}
				{step === "auth" && (
					<SignInStep
						key={attempt}
						onSignedIn={() => void recheck("not-signed-in")}
						onRetry={() => retry("auth")}
					/>
				)}
				{step === "checking" && (
					<div className="flex items-center gap-2.5 py-2 text-sm text-muted-foreground">
						<Spinner className="size-3.5 shrink-0" />
						<Trans>Checking GitHub CLI…</Trans>
					</div>
				)}
				{step === "not-signed-in" && (
					<StepError
						message={<Trans>Sign-in didn't finish.</Trans>}
						onRetry={() => retry("auth")}
					/>
				)}
				{step === "success" && (
					<div className="flex items-center gap-2.5 py-2 text-sm font-medium text-foreground">
						<LuCheck className="size-4 text-emerald-500" strokeWidth={2.5} />
						<Trans>Connected to GitHub</Trans>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
