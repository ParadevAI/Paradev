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
import { Label } from "@superset/ui/label";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { toast } from "@superset/ui/sonner";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { cn } from "@superset/ui/utils";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { SiVercel } from "react-icons/si";

import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import type {
	CloudAuthMethod,
	CloudAuthState,
	CustomProvider,
	SaveCredentialInput,
} from "../../../../hooks/useAgentCredential";
import { ChatgptSignIn } from "./components/ChatgptSignIn";
import { CopyStateIcon } from "./components/CopyStateIcon";
import { DisconnectMenu } from "./components/DisconnectMenu";
import { ExternalTextLink } from "./components/ExternalTextLink";
import { Field } from "./components/Field";
import { ProviderForm } from "./components/ProviderForm";
import { SaveButton } from "./components/SaveButton";
import { SavedSecret } from "./components/SavedSecret";
import { SecretField } from "./components/SecretField";
import { FOCUS_RING } from "./constants";

const CODEX_USAGE_SETTINGS = "https://chatgpt.com/codex/settings/usage";

interface CloudAuthDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	presetId: string;
	label: string;
	state: CloudAuthState;
	accountLabel: string | null;
	chooseMethod: (method: CloudAuthMethod | null) => void;
	save: (input: SaveCredentialInput) => Promise<unknown>;
	signedIn: () => Promise<unknown>;
	disconnect: () => Promise<unknown>;
}

export function CloudAuthDialog({
	open,
	onOpenChange,
	presetId,
	label,
	state,
	accountLabel,
	chooseMethod,
	save,
	signedIn,
	disconnect,
}: CloudAuthDialogProps) {
	const { t } = useLingui();
	const isClaude = presetId === "claude";
	const [view, setView] = useState<"main" | "custom">("main");
	const { copyToClipboard, copied: copiedCommand } = useCopyToClipboard();
	const [baseUrlDraft, setBaseUrlDraft] = useState("");
	const [expanded, setExpanded] = useState<CustomProvider | null>(null);
	const [tokenDraft, setTokenDraft] = useState("");
	const [apiKeyDraft, setApiKeyDraft] = useState("");
	const [apiKeyAdvanced, setApiKeyAdvanced] = useState(false);
	const [replacing, setReplacing] = useState(false);
	const [checking, setChecking] = useState<string | null>(null);
	const [chatgptPlan, setChatgptPlan] = useState<"personal" | "business">(
		"personal",
	);
	const advancedId = useId();

	const handleChatgptConnected = useCallback(
		(connectedAs: string | null) => {
			setReplacing(false);
			toast.success(
				connectedAs
					? t({ message: `Signed in to ChatGPT as ${connectedAs}` })
					: t({ message: "Signed in to ChatGPT" }),
			);
			void signedIn();
		},
		[signedIn, t],
	);

	/**
	 * One call does both: the server checks the credential against the
	 * provider and only stores it if that succeeds. A refusal keeps the
	 * dialog where it is and repeats what the provider said.
	 */
	const verifyAndSave = async (
		id: string,
		input: SaveCredentialInput,
		onOk?: () => void,
	) => {
		setChecking(id);
		try {
			await save(input);
			onOk?.();
			setReplacing(false);
			toast.success(t({ message: "Verified and saved" }));
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t({ message: "The provider refused it." }),
			);
		} finally {
			setChecking(null);
		}
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) {
			setView("main");
			setReplacing(false);
			chooseMethod(null);
		}
		onOpenChange(next);
	};

	const providers: Array<{
		id: CustomProvider;
		label: string;
		icon: React.ReactNode;
		advanced?: boolean;
	}> = [
		{
			id: "gateway",
			label: t({ message: "Vercel AI Gateway" }),
			icon: <SiVercel className="size-4" />,
		},
	];
	const customLabel = providers.find(
		(provider) => provider.id === state.customProvider,
	)?.label;
	const tokenCommand = "claude setup-token";

	const optionClass = "overflow-hidden rounded-lg border border-border text-sm";
	const optionRowClass =
		"flex min-h-12 items-center gap-3 pr-3 transition-colors hover:bg-accent/50";
	const optionLabelClass =
		"flex flex-1 cursor-pointer items-center gap-3 self-stretch py-3 pl-3";
	const optionBodyClass =
		"space-y-3 border-t border-border bg-muted/30 px-3 py-3";

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-xl">
				{view === "custom" ? (
					<>
						<DialogHeader>
							<div className="flex items-center gap-2">
								<Button
									aria-label={t({ message: "Back" })}
									className="size-7"
									onClick={() => setView("main")}
									size="icon"
									variant="ghost"
								>
									<ChevronLeft className="size-4" />
								</Button>
								<DialogTitle>
									<Trans>Custom provider</Trans>
								</DialogTitle>
							</div>
							<DialogDescription>
								<Trans>
									Route {label} through a provider you run, with the credentials
									you hold. Saved values are handed to the agent at launch.
								</Trans>
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-3">
							{providers.map((provider) => {
								const isOpen = expanded === provider.id;
								const saved =
									state.customSaved && state.customProvider === provider.id;
								return (
									<div className={optionClass} key={provider.id}>
										<div className={optionRowClass}>
											<button
												aria-expanded={isOpen}
												className={cn(
													"flex flex-1 items-center gap-3 self-stretch py-3 pl-3 text-left",
													FOCUS_RING,
												)}
												onClick={() => setExpanded(isOpen ? null : provider.id)}
												type="button"
											>
												{isOpen ? (
													<ChevronDown className="size-4 text-muted-foreground" />
												) : (
													<ChevronRight className="size-4 text-muted-foreground" />
												)}
												<span className="text-muted-foreground">
													{provider.icon}
												</span>
												<span className="font-medium">{provider.label}</span>
												{provider.advanced ? (
													<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
														<Trans>Advanced</Trans>
													</span>
												) : null}
												{saved ? (
													<Check className="size-4 text-emerald-500" />
												) : null}
											</button>
											{saved ? (
												<DisconnectMenu
													agentLabel={label}
													credential={provider.label}
													disconnect={disconnect}
												/>
											) : null}
										</div>
										{isOpen ? (
											<div className={optionBodyClass}>
												<ProviderForm
													agent={presetId}
													checking={checking === provider.id}
													onSave={(value, baseUrl) =>
														verifyAndSave(provider.id, {
															kind: "api_key",
															value,
															baseUrl,
															provider: provider.id,
														})
													}
													provider={provider.id}
													saved={saved}
												/>
											</div>
										) : null}
									</div>
								);
							})}
						</div>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>{label}</DialogTitle>
							<DialogDescription>
								<Trans>
									How {label} signs in when Superset runs it for you.
								</Trans>
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-3">
							<RadioGroup
								className="gap-3"
								onValueChange={(value) => {
									setReplacing(false);
									chooseMethod(value as CloudAuthMethod);
								}}
								value={state.method === "custom" ? "" : state.method}
							>
								<div className={optionClass}>
									<div className={optionRowClass}>
										<Label
											className={optionLabelClass}
											htmlFor={`${presetId}-sub`}
										>
											<RadioGroupItem
												id={`${presetId}-sub`}
												value="subscription"
											/>
											<Trans>Subscription</Trans>
											{state.subscriptionConnected ? (
												<Check className="size-4 text-emerald-500" />
											) : null}
											{state.subscriptionConnected && accountLabel ? (
												<span className="truncate text-xs font-normal text-muted-foreground">
													{accountLabel}
												</span>
											) : null}
										</Label>
										{state.subscriptionConnected ? (
											<DisconnectMenu
												agentLabel={label}
												credential={t({ message: "subscription" })}
												disconnect={disconnect}
												onReconnect={
													isClaude
														? undefined
														: () => {
																chooseMethod("subscription");
																setReplacing(true);
															}
												}
											/>
										) : null}
									</div>
									{state.method === "subscription" ? (
										<div className={optionBodyClass}>
											{state.subscriptionConnected && !replacing ? (
												isClaude ? (
													<SavedSecret
														label={t({ message: "Token" })}
														onReplace={() => setReplacing(true)}
													/>
												) : (
													<ExternalTextLink href={CODEX_USAGE_SETTINGS}>
														<Trans>Manage usage</Trans>
													</ExternalTextLink>
												)
											) : (
												<>
													{isClaude ? null : (
														<div className="flex items-center gap-2">
															<ToggleGroup
																className="justify-start"
																onValueChange={(value) => {
																	if (
																		value === "personal" ||
																		value === "business"
																	) {
																		setChatgptPlan(value);
																	}
																}}
																size="sm"
																type="single"
																value={chatgptPlan}
																variant="outline"
															>
																<ToggleGroupItem value="personal">
																	<Trans>Personal plan</Trans>
																</ToggleGroupItem>
																<ToggleGroupItem value="business">
																	<Trans>Business plan</Trans>
																</ToggleGroupItem>
															</ToggleGroup>
															{replacing ? (
																<Button
																	className="ml-auto"
																	onClick={() => setReplacing(false)}
																	size="sm"
																	variant="ghost"
																>
																	<Trans>Cancel</Trans>
																</Button>
															) : null}
														</div>
													)}
													{isClaude ? (
														<>
															<p className="text-muted-foreground">
																<Trans>
																	Run{" "}
																	<code className="rounded bg-muted px-1 py-0.5 font-mono">
																		{tokenCommand}
																	</code>
																	<button
																		aria-label={t({
																			message: "Copy command",
																		})}
																		className={cn(
																			"ml-1 inline-flex h-5 items-center rounded-sm align-top text-muted-foreground hover:text-foreground",
																			FOCUS_RING,
																		)}
																		onClick={() =>
																			void copyToClipboard(tokenCommand)
																		}
																		type="button"
																	>
																		<CopyStateIcon copied={copiedCommand} />
																	</button>{" "}
																	in a terminal and paste the token here.
																</Trans>
															</p>
															<div className="flex items-center gap-2">
																<SecretField
																	className="flex-1"
																	hideLabel
																	label={t({ message: "Token" })}
																	onChange={setTokenDraft}
																	placeholder="CLAUDE_CODE_OAUTH_TOKEN"
																	value={tokenDraft}
																/>
																<SaveButton
																	checking={checking === "subscription"}
																	disabled={!tokenDraft.trim()}
																	onClick={() =>
																		verifyAndSave(
																			"subscription",
																			{
																				kind: "subscription",
																				value: tokenDraft.trim(),
																			},
																			() => setTokenDraft(""),
																		)
																	}
																/>
															</div>
														</>
													) : (
														<ChatgptSignIn
															onConnected={handleChatgptConnected}
															plan={chatgptPlan}
														/>
													)}
												</>
											)}
										</div>
									) : null}
								</div>

								<div className={optionClass}>
									<div className={optionRowClass}>
										<Label
											className={optionLabelClass}
											htmlFor={`${presetId}-key`}
										>
											<RadioGroupItem id={`${presetId}-key`} value="api_key" />
											<Trans>API key</Trans>
											{state.apiKeySaved ? (
												<Check className="size-4 text-emerald-500" />
											) : null}
										</Label>
										<ExternalTextLink
											href={
												isClaude
													? "https://console.anthropic.com/settings/keys"
													: "https://platform.openai.com/api-keys"
											}
											underline
										>
											<Trans>Get key</Trans>
										</ExternalTextLink>
										{state.apiKeySaved ? (
											<DisconnectMenu
												agentLabel={label}
												credential={t({ message: "API key" })}
												disconnect={disconnect}
											/>
										) : null}
									</div>
									{state.method === "api_key" ? (
										<div className={optionBodyClass}>
											{state.apiKeySaved && !replacing ? (
												<SavedSecret
													label={t({ message: "API key" })}
													onReplace={() => setReplacing(true)}
												/>
											) : (
												<>
													<button
														aria-controls={advancedId}
														aria-expanded={apiKeyAdvanced}
														className={cn(
															"flex items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground",
															FOCUS_RING,
														)}
														onClick={() => setApiKeyAdvanced((value) => !value)}
														type="button"
													>
														{apiKeyAdvanced ? (
															<ChevronDown className="size-4" />
														) : (
															<ChevronRight className="size-4" />
														)}
														<Trans>Advanced</Trans>
													</button>
													{apiKeyAdvanced ? (
														<div id={advancedId}>
															<Field
																label={t({ message: "Base URL" })}
																onChange={setBaseUrlDraft}
																placeholder={
																	isClaude
																		? "https://api.anthropic.com"
																		: "https://api.openai.com/v1"
																}
																value={baseUrlDraft}
															/>
														</div>
													) : null}
													<div className="flex items-center gap-2">
														<SecretField
															className="flex-1"
															hideLabel
															label={t({ message: "API key" })}
															onChange={setApiKeyDraft}
															placeholder={
																isClaude
																	? "ANTHROPIC_API_KEY"
																	: "OPENAI_API_KEY"
															}
															value={apiKeyDraft}
														/>
														<SaveButton
															checking={checking === "api_key"}
															disabled={!apiKeyDraft.trim()}
															onClick={() =>
																verifyAndSave(
																	"api_key",
																	{
																		kind: "api_key",
																		value: apiKeyDraft.trim(),
																		...(baseUrlDraft.trim()
																			? { baseUrl: baseUrlDraft.trim() }
																			: {}),
																	},
																	() => setApiKeyDraft(""),
																)
															}
														/>
													</div>
												</>
											)}
										</div>
									) : null}
								</div>
							</RadioGroup>

							{/* Custom provider: a nested view, not a radio */}
							<div className={optionClass}>
								<button
									className={cn(
										optionRowClass,
										"w-full pl-3 text-left font-medium",
										FOCUS_RING,
									)}
									onClick={() => setView("custom")}
									type="button"
								>
									<span className="flex-1">
										<Trans>Custom provider</Trans>
										{state.method === "custom" && customLabel ? (
											<span className="ml-2 font-normal text-muted-foreground">
												{customLabel}
											</span>
										) : null}
									</span>
									{state.method === "custom" && state.customSaved ? (
										<Check className="size-4 text-emerald-500" />
									) : null}
									<ChevronRight className="size-4 text-muted-foreground" />
								</button>
							</div>
						</div>
					</>
				)}

				<DialogFooter>
					<Button onClick={() => handleOpenChange(false)} variant="outline">
						<Trans>Done</Trans>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
