import { Trans, useLingui } from "@lingui/react/macro";
import { formatList } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LuX } from "react-icons/lu";
import type { CardBlockViewProps } from "../../../../types";
import { ActionButton } from "../../../ActionButton";
import { SlackChannelLabel } from "../../../SlackChannelLabel";
import { StripeTag } from "../../../StripeTag";
import { ChannelFacts } from "../ChannelFacts";

const EMAILS_MAX = 10;
const EMAIL = /^[^\s<>,;"@]+@[^\s<>,;"@]+\.[^\s<>,;"@]+$/;

/** Slack Connect's invitation: the channel, and the addresses of people in another organization. */
export function ConnectForm({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"slack.channel">) {
	const { t } = useLingui();
	const { channel, workspace } = view;
	const [emails, setEmails] = useState(view.emails);
	const [draft, setDraft] = useState("");
	const [invalid, setInvalid] = useState(false);
	const action = (id: string) => actions.find((entry) => entry.id === id);
	const full = emails.length >= EMAILS_MAX;
	const add = () => {
		const email = draft.trim();
		if (!email) return;
		if (!EMAIL.test(email)) {
			setInvalid(true);
			return;
		}
		if (!emails.includes(email)) setEmails([...emails, email]);
		setDraft("");
	};
	const name = channel?.name ?? "";
	const who = formatList(emails);

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-3 px-4 py-3">
				{channel && (
					<ChannelFacts channel={channel}>
						<Trans>
							Invite people to <SlackChannelLabel channel={channel} />
						</Trans>
					</ChannelFacts>
				)}
				<div className="flex flex-col gap-2">
					<div>
						<StripeTag tone="warn">
							<Trans>People outside {workspace}</Trans>
						</StripeTag>
					</div>
					<ul className="flex flex-wrap gap-1.5">
						{emails.map((email) => (
							<li
								key={email}
								className="flex h-7 items-center gap-1 rounded-md bg-muted/60 pr-1 pl-2 text-[13px] text-foreground"
							>
								{email}
								{!done && (
									<button
										type="button"
										disabled={pending}
										aria-label={t({ message: `Remove ${email}` })}
										onClick={() =>
											setEmails(emails.filter((each) => each !== email))
										}
										className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-fill-hover hover:text-foreground disabled:opacity-50"
									>
										<LuX className="size-3" />
									</button>
								)}
							</li>
						))}
					</ul>
					{!done && (
						<div className="flex flex-wrap items-center gap-2">
							<input
								type="email"
								value={draft}
								disabled={pending || full}
								aria-label={t({ message: "Email address" })}
								aria-invalid={invalid || undefined}
								placeholder={t({ message: "name@example.com" })}
								onChange={(event) => {
									setDraft(event.target.value);
									setInvalid(false);
								}}
								onKeyDown={(event) => {
									if (event.key !== "Enter" && event.key !== ",") return;
									event.preventDefault();
									add();
								}}
								className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40 disabled:opacity-50 aria-invalid:border-destructive"
							/>
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={pending || full || draft.trim() === ""}
								onClick={add}
							>
								<Trans context="add an email address to an invitation">
									Add
								</Trans>
							</Button>
							{invalid && (
								<p className="w-full text-xs text-destructive">
									<Trans>Enter one email address</Trans>
								</p>
							)}
						</div>
					)}
				</div>
			</div>
			{failure && (
				<p role="alert" className="px-4 pb-3 text-xs text-destructive">
					{failure}
				</p>
			)}
			{!done && (
				<div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
					<ActionButton
						action={action("dismiss")}
						pending={pending}
						variant="outline"
						onClick={() => onAct("dismiss")}
					>
						<Trans>Leave it</Trans>
					</ActionButton>
					<ActionButton
						action={action("connect")}
						pending={pending}
						disabled={emails.length === 0}
						confirmText={t({
							message: `Invite ${who} to #${name} through Slack Connect? They are outside ${workspace}.`,
						})}
						onClick={() =>
							channel && onAct("connect", { channel: channel.id, emails })
						}
					>
						<Trans>Send invitation</Trans>
					</ActionButton>
				</div>
			)}
		</div>
	);
}
