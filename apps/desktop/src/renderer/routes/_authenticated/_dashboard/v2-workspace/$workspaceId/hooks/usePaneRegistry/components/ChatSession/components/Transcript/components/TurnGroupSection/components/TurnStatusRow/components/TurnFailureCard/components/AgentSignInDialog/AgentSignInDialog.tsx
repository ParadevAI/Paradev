import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Spinner } from "@superset/ui/spinner";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "../../../../../../../../../../components/CopyButton";
import type {
	AgentSignIn,
	DeviceCode,
} from "../../../../../../../../../../providers/TurnFailureActionsProvider";
import { SignInProgress } from "./components/SignInProgress";
import { CHATGPT_SECURITY_SETTINGS, SETUP_TOKEN_COMMAND } from "./constants";

type Step =
	| { name: "start" }
	| { name: "device_code"; code: DeviceCode }
	| { name: "api_key" }
	| { name: "signing_in" }
	| { name: "restarting" }
	| { name: "restart_failed" };

const BUSY_STEPS: ReadonlySet<Step["name"]> = new Set([
	"signing_in",
	"restarting",
]);

export function AgentSignInDialog({
	open,
	onOpenChange,
	signIn,
	restartAndContinue,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	signIn: AgentSignIn;
	restartAndContinue: () => Promise<boolean>;
}) {
	const { t } = useLingui();
	const [step, setStep] = useState<Step>({ name: "start" });
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [opening, setOpening] = useState(false);
	const attempt = useRef(0);
	const pending = useRef<AbortController | null>(null);
	const { label } = signIn;
	const busy = BUSY_STEPS.has(step.name);

	const abandon = () => {
		attempt.current += 1;
		pending.current?.abort();
		pending.current = null;
		setOpening(false);
	};

	useEffect(() => {
		if (!open) {
			attempt.current += 1;
			pending.current?.abort();
			setOpening(false);
			return;
		}
		setStep({ name: "start" });
		setValue("");
		setError(null);
	}, [open]);

	useEffect(() => () => pending.current?.abort(), []);

	const reason = (cause: unknown) =>
		cause instanceof Error
			? cause.message
			: t({ message: "Something went wrong." });

	const go = (next: Step) => {
		setError(null);
		setValue("");
		setStep(next);
	};

	const restart = async (current: number) => {
		setStep({ name: "restarting" });
		let restarted = false;
		try {
			restarted = await restartAndContinue();
		} catch {
			restarted = false;
		}
		if (current !== attempt.current) return;
		if (restarted) onOpenChange(false);
		else setStep({ name: "restart_failed" });
	};

	const save = async (submit: () => Promise<void>, back: Step) => {
		const current = ++attempt.current;
		setError(null);
		setStep({ name: "signing_in" });
		try {
			await submit();
		} catch (cause) {
			if (current !== attempt.current) return;
			setStep(back);
			setError(reason(cause));
			return;
		}
		await restart(current);
	};

	const startDeviceCode = async () => {
		if (signIn.mode !== "device") return;
		abandon();
		const current = attempt.current;
		setError(null);
		setOpening(true);
		try {
			const code = await signIn.startDeviceCode();
			if (current !== attempt.current) return;
			signIn.openUrl(code.verificationUrl);
			go({ name: "device_code", code });
			const controller = new AbortController();
			pending.current = controller;
			await signIn.waitForDeviceCode(code, controller.signal);
			if (current !== attempt.current) return;
			pending.current = null;
			await restart(current);
		} catch (cause) {
			if (current !== attempt.current) return;
			pending.current = null;
			setStep({ name: "start" });
			setError(reason(cause));
		} finally {
			if (current === attempt.current) setOpening(false);
		}
	};

	const back = () => {
		abandon();
		go({ name: "start" });
	};

	const command =
		signIn.mode === "command"
			? signIn.command
			: signIn.mode === "token"
				? SETUP_TOKEN_COMMAND
				: null;
	const trimmed = value.trim();
	const describedByStep =
		step.name === "start" ||
		step.name === "device_code" ||
		step.name === "api_key";

	return (
		<Dialog
			modal
			open={open}
			onOpenChange={(next) => {
				if (!next && busy) return;
				onOpenChange(next);
			}}
		>
			<DialogContent
				className="sm:max-w-md"
				showCloseButton={!busy}
				{...(describedByStep ? {} : { "aria-describedby": undefined })}
			>
				<DialogHeader>
					<DialogTitle>
						<Trans>Sign in to {label}</Trans>
					</DialogTitle>
					{step.name === "start" && (
						<DialogDescription>
							{signIn.mode === "command" ? (
								<Trans>Run this in a terminal, then continue:</Trans>
							) : signIn.mode === "token" ? (
								<Trans>
									Run this in a terminal, then paste the token it prints:
								</Trans>
							) : (
								<Trans>Use your ChatGPT plan.</Trans>
							)}
						</DialogDescription>
					)}
					{step.name === "device_code" && (
						<DialogDescription>
							<Trans>Enter this code on the page we opened:</Trans>
						</DialogDescription>
					)}
					{step.name === "api_key" && (
						<DialogDescription>
							{signIn.mode === "token" ? (
								<Trans>An Anthropic API key.</Trans>
							) : (
								<Trans>An OpenAI API key.</Trans>
							)}
						</DialogDescription>
					)}
				</DialogHeader>

				{step.name === "start" && command && (
					<div className="flex min-w-0 items-center gap-1 rounded-md border bg-muted/40 py-1 pr-1 pl-2.5 font-mono text-[13px]">
						<code className="min-w-0 flex-1 select-all wrap-anywhere">
							{command}
						</code>
						<CopyButton label={t({ message: "Copy command" })} text={command} />
					</div>
				)}

				{step.name === "start" && signIn.mode === "token" && (
					<form
						className="flex flex-col gap-2"
						id="agent-sign-in-form"
						onSubmit={(event) => {
							event.preventDefault();
							if (!trimmed) return;
							void save(() => signIn.saveToken(trimmed), { name: "start" });
						}}
					>
						<Input
							aria-label={t({ message: "Token" })}
							autoComplete="off"
							autoFocus
							className="font-mono"
							onChange={(event) => setValue(event.target.value)}
							type="password"
							value={value}
						/>
					</form>
				)}

				{step.name === "start" && signIn.mode === "device" && (
					<div className="flex flex-col gap-3">
						<Button
							className="w-full gap-1.5"
							disabled={opening}
							onClick={() => void startDeviceCode()}
						>
							{opening ? (
								<Spinner />
							) : (
								<>
									<Trans>Open ChatGPT to sign in</Trans>
									<ArrowUpRight className="size-4" />
								</>
							)}
						</Button>
						<p className="text-muted-foreground text-xs">
							<Trans>
								First time? Turn on device code sign-in in{" "}
								<button
									className="underline underline-offset-4 hover:text-foreground"
									onClick={() => signIn.openUrl(CHATGPT_SECURITY_SETTINGS)}
									type="button"
								>
									ChatGPT settings
								</button>
								.
							</Trans>
						</p>
					</div>
				)}

				{step.name === "device_code" && (
					<div className="flex flex-col items-center gap-3 py-2 text-center">
						<div className="flex items-center gap-1 rounded-lg border border-dashed px-4 py-2.5">
							<span className="font-mono font-semibold text-xl tracking-[0.2em]">
								{step.code.userCode}
							</span>
							<CopyButton
								label={t({ message: "Copy code" })}
								text={step.code.userCode}
							/>
						</div>
						<p className="flex items-center gap-2 text-muted-foreground text-xs">
							<Spinner className="size-3.5" />
							<Trans>Waiting for approval…</Trans>
						</p>
					</div>
				)}

				{step.name === "api_key" && signIn.mode !== "command" && (
					<form
						className="flex flex-col gap-2"
						id="agent-sign-in-form"
						onSubmit={(event) => {
							event.preventDefault();
							if (!trimmed) return;
							void save(() => signIn.saveApiKey(trimmed), { name: "api_key" });
						}}
					>
						<Input
							aria-label={t({ message: "API key" })}
							autoComplete="off"
							autoFocus
							className="font-mono"
							onChange={(event) => setValue(event.target.value)}
							placeholder={signIn.mode === "token" ? "sk-ant-…" : "sk-proj-…"}
							type="password"
							value={value}
						/>
						<p className="text-muted-foreground text-xs">
							<Trans>We check it with the provider before we save it.</Trans>
						</p>
					</form>
				)}

				<div aria-live="polite">
					{step.name === "signing_in" && (
						<SignInProgress title={<Trans>Signing in…</Trans>}>
							<Trans>Checking with the provider.</Trans>
						</SignInProgress>
					)}

					{step.name === "restarting" && (
						<SignInProgress title={<Trans>Restarting {label}…</Trans>}>
							<Trans>Your chat history stays. Only the agent restarts.</Trans>
						</SignInProgress>
					)}

					{step.name === "restart_failed" && (
						<div className="flex flex-col gap-1 py-2 text-sm">
							<p className="font-medium">
								<Trans>Signed in, but {label} did not restart.</Trans>
							</p>
							<p className="text-muted-foreground">
								<Trans>
									Try again, or close this and press Continue in the chat.
								</Trans>
							</p>
						</div>
					)}
				</div>

				{error && (
					<p className="text-destructive text-sm" role="alert">
						{error}
					</p>
				)}

				{!busy && (
					<DialogFooter className="items-center sm:justify-between">
						<div className="text-xs">
							{step.name === "start" && signIn.mode !== "command" && (
								<button
									className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
									onClick={() => {
										abandon();
										go({ name: "api_key" });
									}}
									type="button"
								>
									<Trans>Paste an API key instead</Trans>
								</button>
							)}
							{(step.name === "api_key" || step.name === "device_code") && (
								<button
									className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
									onClick={back}
									type="button"
								>
									<Trans>Back</Trans>
								</button>
							)}
						</div>
						<div className="flex gap-2">
							{(step.name === "start" || step.name === "device_code") && (
								<Button onClick={() => onOpenChange(false)} variant="ghost">
									<Trans>Cancel</Trans>
								</Button>
							)}
							{step.name === "start" && signIn.mode === "command" && (
								<Button onClick={() => void restart(++attempt.current)}>
									<Trans>I've signed in</Trans>
								</Button>
							)}
							{step.name === "start" && signIn.mode === "token" && (
								<Button
									disabled={!trimmed}
									form="agent-sign-in-form"
									type="submit"
								>
									<Trans>Sign in</Trans>
								</Button>
							)}
							{step.name === "api_key" && (
								<Button
									disabled={!trimmed}
									form="agent-sign-in-form"
									type="submit"
								>
									<Trans>Save and continue</Trans>
								</Button>
							)}
							{step.name === "restart_failed" && (
								<>
									<Button onClick={() => onOpenChange(false)} variant="ghost">
										<Trans>Close</Trans>
									</Button>
									<Button onClick={() => void restart(++attempt.current)}>
										<Trans>Try again</Trans>
									</Button>
								</>
							)}
						</div>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
