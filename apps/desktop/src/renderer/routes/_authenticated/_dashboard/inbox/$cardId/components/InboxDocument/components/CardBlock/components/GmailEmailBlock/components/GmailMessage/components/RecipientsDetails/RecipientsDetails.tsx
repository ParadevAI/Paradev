import { Trans, useLingui } from "@lingui/react/macro";
import { formatList } from "@superset/i18n/format";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { LuChevronDown } from "react-icons/lu";
import type { GmailAddress, GmailMessageView } from "../../../../types";
import { displayName, formatRecipient } from "../../../../utils/addresses";

interface RecipientsDetailsProps {
	message: GmailMessageView;
	me: string;
	subject: string;
	when: string;
}

/** Gmail's "to me, Avery ▾": who it went to in short, the full headers on click. */
export function RecipientsDetails({
	message,
	me,
	subject,
	when,
}: RecipientsDetailsProps) {
	const { t } = useLingui();
	const short = (address: GmailAddress) =>
		address.email.toLowerCase() === me.toLowerCase()
			? t({ message: "me", context: "email recipient" })
			: (address.name?.split(/\s+/)[0] ?? address.email);
	const everyone = [...message.to, ...message.cc, ...message.bcc];
	const rows: [string, string][] = [
		[t({ message: "from:" }), formatRecipient(message.from)],
		[t({ message: "to:" }), message.to.map(formatRecipient).join(", ")],
		...(message.cc.length
			? [
					[
						t({ message: "cc:" }),
						message.cc.map(formatRecipient).join(", "),
					] as [string, string],
				]
			: []),
		...(message.bcc.length
			? [
					[
						t({ message: "bcc:" }),
						message.bcc.map(formatRecipient).join(", "),
					] as [string, string],
				]
			: []),
		[t({ message: "date:" }), when],
		[t({ message: "subject:" }), subject],
	];
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					onClick={(event) => event.stopPropagation()}
					className="flex max-w-full items-center gap-0.5 rounded text-left text-[12px] leading-5 text-muted-foreground hover:text-foreground"
				>
					<span className="truncate">
						<Trans>to {formatList(everyone.map(short))}</Trans>
					</span>
					<LuChevronDown className="size-3.5 shrink-0" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[28rem] p-3">
				<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
					{rows.map(([label, value]) => (
						<div key={label} className="contents">
							<dt className="text-right text-muted-foreground">{label}</dt>
							<dd className="min-w-0 break-words text-foreground">{value}</dd>
						</div>
					))}
				</dl>
				<p className="sr-only">{displayName(message.from)}</p>
			</PopoverContent>
		</Popover>
	);
}
