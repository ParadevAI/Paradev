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
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { ArrowUpRight, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "../../../../../../../../../../components/CopyButton";
import type {
	AgentSignIn,
	DeviceCode,
	SignedInAccount,
} from "../../../../../../../../../../providers/TurnFailureActionsProvider";
import { SignInProgress } from "./components/SignInProgress";
import { CHATGPT_SECURITY_SETTINGS, CLOSE_AFTER_DONE_MS } from "./constants";

type Step =
	| { name: "start" }
	| { name: "paste_code" }
	| { name: "device_code"; code: DeviceCode }
	| { name: "api_key" }
	| { name: "signing_in" }
	| { name: "restarting"; account: SignedInAccount }
	| { name: "restart_failed"; account: SignedInAccount }
	| { name: "done"; account: SignedInAccount };

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
	const [plan, setPlan] = useState<"personal" | "business">("personal");
	const [opening, setOpening] = useState(false);
	const attempt = useRef(0);
	const { label } = signIn;

	useEffect(() => {
		if (open) return;
		attempt.current += 1;
		setStep({ name: "start" });
		setValue("");
		setError(null);
		setOpening(false);
	}, [open]);

	useEffect(() => {
		if (step.name !== "done") return;
		const timer = setTimeout(() => onOpenChange(false), CLOSE_AFTER_DONE_MS);
		return () => clearTimeout(timer);
	}, [step.name, onOpenChange]);

	const reason = (cause: unknown) =>
		cause instanceof Error
			? cause.message
			: t({ message: "Something went wrong." });

	const go = (next: Step) => {
		setError(null);
		setValue("");
		setStep(next);
	};

	const restart = async (account: SignedInAccount, current: number) => {
		setStep({ name: "restarting", account });
		const restarted = await restartAndContinue();
		if (current !== attempt.current) return;
		setStep(
			restarted
				? { name: "done", account }
				: { name: "restart_failed", account },
		);
	};

	const save = async (submit: () => Promise<SignedInAccount>, back: Step) => {
		const current = ++attempt.current;
		setError(null);
		setStep({ name: "signing_in" });
		try {
			const account = await submit();
			if (current !== attempt.current) return;
			await restart(account, current);
		} catch (cause) {
			if (current !== attempt.current) return;
			setStep(back);
			setError(reason(cause));
		}
	};

	const begin = async () => {
		const current = ++attempt.current;
		setError(null);
		setOpening(true);
		try {
			if (signIn.agent === "claude") {
				const { url } = await signIn.startOauth();
				if (current !== attempt.current) return;
				signIn.openUrl(url);
				go({ name: "paste_code" });
				return;
			}
			const code = await signIn.startDeviceCode(plan);
			if (current !== attempt.current) return;
			signIn.openUrl(code.verificationUrl);
			go({ name: "device_code", code });
			const account = await signIn.waitForDeviceCode();
			if (current !== attempt.current) return;
			await restart(account, current);
		} catch (cause) {
			if (current !== attempt.current) return;
			setStep({ name: "start" });
			setError(reason(cause));
		} finally {
			if (current === attempt.current) setOpening(false);
		}
	};

	const trimmed = value.trim();
	const busy =
		step.name === "signing_in" ||
		step.name === "restarting" ||
		step.name === "done";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>Sign in to {label}</Trans>
					</DialogTitle>
					{step.name === "start" && (
						<DialogDescription>
							{signIn.agent === "claude" ? (
								<Trans>
									Use your Claude Pro or Max plan in cloud workspaces.
								</Trans>
							) : (
								<Trans>Use your ChatGPT plan in cloud workspaces.</Trans>
							)}
						</DialogDescription>
					)}
					{step.name === "paste_code" && (
						<DialogDescription>
							<Trans>
								Click Authorize on claude.ai. Anthropic then shows a code. Paste
								it here.
							</Trans>
						</DialogDescription>
					)}
					{step.name === "api_key" && (
						<DialogDescription>
							{signIn.agent === "claude" ? (
								<Trans>
									An Anthropic API key, or a token from claude setup-token.
								</Trans>
							) : (
								<Trans>An OpenAI API key.</Trans>
							)}
						</DialogDescription>
					)}
				</DialogHeader>

				{step.name === "start" && (
					<div className="flex flex-col gap-3">
						{signIn.agent === "codex" && (
							<ToggleGroup
								className="w-full"
								onValueChange={(next) => {
									if (next === "personal" || next === "business") setPlan(next);
								}}
								type="single"
								value={plan}
								variant="outline"
							>
								<ToggleGroupItem className="flex-1" value="personal">
									<Trans>Personal</Trans>
								</ToggleGroupItem>
								<ToggleGroupItem className="flex-1" value="business">
									<Trans>Business</Trans>
								</ToggleGroupItem>
							</ToggleGroup>
						)}
						<Button
							className="w-full gap-1.5"
							disabled={opening}
							onClick={() => void begin()}
						>
							{opening ? (
								<Spinner />
							) : signIn.agent === "claude" ? (
								<>
									<Trans>Open claude.ai to sign in</Trans>
									<ArrowUpRight className="size-4" />
								</>
							) : (
								<>
									<Trans>Open ChatGPT to sign in</Trans>
									<ArrowUpRight className="size-4" />
								</>
							)}
						</Button>
						{signIn.agent === "codex" && plan === "personal" && (
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
						)}
					</div>
				)}

				{step.name === "paste_code" && (
					<form
						className="flex flex-col gap-2"
						id="agent-sign-in-form"
						onSubmit={(event) => {
							event.preventDefault();
							if (signIn.agent !== "claude" || !trimmed) return;
							void save(() => signIn.finishOauth(trimmed), {
								name: "paste_code",
							});
						}}
					>
						<Input
							aria-label={t({ message: "Code" })}
							autoFocus
							className="font-mono"
							onChange={(event) => setValue(event.target.value)}
							placeholder={t({ message: "Paste the code" })}
							value={value}
						/>
						<button
							className="self-start text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
							onClick={() => void begin()}
							type="button"
						>
							<Trans>Open claude.ai again</Trans>
						</button>
					</form>
				)}

				{step.name === "device_code" && (
					<div className="flex flex-col items-center gap-3 py-2 text-center">
						<p className="text-muted-foreground text-sm">
							<Trans>Enter this code on the page we opened:</Trans>
						</p>
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

				{step.name === "api_key" && (
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
							placeholder={signIn.agent === "claude" ? "sk-ant-…" : "sk-proj-…"}
							type="password"
							value={value}
						/>
						<p className="text-muted-foreground text-xs">
							<Trans>We check it with the provider before we save it.</Trans>
						</p>
					</form>
				)}

				{step.name === "signing_in" && (
					<SignInProgress title={<Trans>Signing in…</Trans>}>
						<Trans>
							Checking with the provider and updating your workspace.
						</Trans>
					</SignInProgress>
				)}

				{step.name === "restarting" && (
					<SignInProgress title={<Trans>Restarting {label}…</Trans>}>
						<Trans>Your chat history stays. Only the agent restarts.</Trans>
					</SignInProgress>
				)}

				{step.name === "done" && (
					<div className="flex flex-col items-center gap-2 py-4 text-center">
						<span className="flex size-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
							<Check className="size-5" />
						</span>
						<p className="font-medium">
							<Trans>Signed in</Trans>
						</p>
						<p className="text-muted-foreground text-sm">
							{step.account.accountLabel ? (
								<>
									{step.account.accountLabel}
									<br />
								</>
							) : null}
							<Trans>Continuing your chat…</Trans>
						</p>
					</div>
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

				{error && <p className="text-destructive text-sm">{error}</p>}

				{!busy && (
					<DialogFooter className="items-center sm:justify-between">
						<div className="text-xs">
							{step.name === "start" && (
								<button
									className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
									onClick={() => go({ name: "api_key" })}
									type="button"
								>
									<Trans>Paste an API key instead</Trans>
								</button>
							)}
							{(step.name === "paste_code" ||
								step.name === "api_key" ||
								step.name === "device_code") && (
								<button
									className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
									onClick={() => {
										attempt.current += 1;
										setOpening(false);
										go({ name: "start" });
									}}
									type="button"
								>
									<Trans>Back</Trans>
								</button>
							)}
						</div>
						<div className="flex gap-2">
							{step.name === "paste_code" && (
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
								<Button
									onClick={() => void restart(step.account, ++attempt.current)}
								>
									<Trans>Try again</Trans>
								</Button>
							)}
							{(step.name === "start" ||
								step.name === "device_code" ||
								step.name === "restart_failed") && (
								<Button onClick={() => onOpenChange(false)} variant="ghost">
									{step.name === "restart_failed" ? (
										<Trans>Close</Trans>
									) : (
										<Trans>Cancel</Trans>
									)}
								</Button>
							)}
						</div>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
