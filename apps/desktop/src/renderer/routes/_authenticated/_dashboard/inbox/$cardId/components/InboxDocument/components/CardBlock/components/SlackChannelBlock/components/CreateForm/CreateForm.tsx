import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useId, useState } from "react";
import type { CardBlockViewProps } from "../../../../types";
import { ActionButton } from "../../../ActionButton";
import { SlackChannelLabel } from "../../../SlackChannelLabel";
import { StripeField } from "../../../StripeField";
import { StripeRadio } from "../../../StripeRadio";
import { InviteeList } from "../InviteeList";

const NAME_MAX = 80;
const CHANNEL_NAME = /^[\p{Ll}\p{Lo}\p{N}_-]{1,80}$/u;

/** What Slack does to a channel name as it is typed. */
const asTyped = (raw: string) =>
	raw.toLowerCase().replace(/\s+/g, "-").slice(0, NAME_MAX);

/** Slack's "Create a channel" dialog: the name, who can find it, and who starts in it. */
export function CreateForm({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"slack.channel">) {
	const { t } = useLingui();
	const nameId = useId();
	const { workspace } = view;
	const [name, setName] = useState(() => asTyped(view.proposed.name));
	const [isPrivate, setIsPrivate] = useState(view.proposed.private);
	const [invitees, setInvitees] = useState(view.invitees);
	const action = (id: string) => actions.find((entry) => entry.id === id);
	const valid = CHANNEL_NAME.test(name);
	const others = invitees.filter((invitee) => !invitee.person.isReader);
	const count = others.length;
	const people = t({
		message: plural(count, { one: "# person", other: "# people" }),
	});
	const confirmText = isPrivate
		? count > 0
			? t({ message: `Create private channel #${name} and add ${people}?` })
			: t({ message: `Create private channel #${name}?` })
		: count > 0
			? t({ message: `Create public channel #${name} and add ${people}?` })
			: t({ message: `Create public channel #${name}?` });

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-4 px-4 py-3">
				{done ? (
					<div className="flex items-center gap-2 text-[13px]">
						<SlackChannelLabel
							channel={{
								kind: isPrivate ? "private" : "channel",
								name,
								external: false,
							}}
						/>
						<span className="text-xs text-muted-foreground">
							{isPrivate ? <Trans>Private</Trans> : <Trans>Public</Trans>}
						</span>
					</div>
				) : (
					<>
						<StripeField
							label={<label htmlFor={nameId}>{t({ message: "Name" })}</label>}
						>
							<div className="flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2 text-[13px] focus-within:border-foreground/40 has-[input[aria-invalid]]:border-destructive">
								<span className="text-muted-foreground">#</span>
								<input
									id={nameId}
									value={name}
									disabled={pending}
									maxLength={NAME_MAX}
									aria-invalid={(name !== "" && !valid) || undefined}
									placeholder={t({ message: "e.g. plan-budget" })}
									onChange={(event) => setName(asTyped(event.target.value))}
									className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
								/>
								<span className="text-xs text-muted-foreground tabular-nums">
									{NAME_MAX - name.length}
								</span>
							</div>
							{name !== "" && !valid && (
								<p className="text-xs text-destructive">
									<Trans>
										Channel names can’t contain spaces or punctuation. Use
										dashes to separate words.
									</Trans>
								</p>
							)}
						</StripeField>
						<StripeField label={<Trans>Visibility</Trans>}>
							<StripeRadio
								label={t({ message: "Visibility" })}
								value={isPrivate ? "private" : "public"}
								onChange={(next) => setIsPrivate(next === "private")}
								disabled={pending}
								options={[
									{
										value: "public",
										label: t({ message: "Public" }),
										detail: t({ message: `Anyone in ${workspace}` }),
									},
									{
										value: "private",
										label: t({ message: "Private" }),
										detail: t({ message: "Only specific people" }),
									},
								]}
							/>
						</StripeField>
					</>
				)}
				<StripeField label={<Trans>Add people</Trans>}>
					<InviteeList
						invitees={invitees}
						directory={view.directory}
						onChange={setInvitees}
						readOnly={done}
						disabled={pending}
					/>
				</StripeField>
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
						action={action("create")}
						pending={pending}
						disabled={!valid}
						confirmText={confirmText}
						onClick={() =>
							onAct("create", {
								name,
								private: isPrivate,
								users: others.map((invitee) => invitee.person.id),
							})
						}
					>
						<Trans context="create a Slack channel">Create</Trans>
					</ActionButton>
				</div>
			)}
		</div>
	);
}
