import { useLingui } from "@lingui/react/macro";
import type { GmailEmailView } from "../../types";
import { formatRecipient } from "../../utils/addresses";

interface FromFieldProps {
	sendAs: GmailEmailView["sendAs"];
	value: string;
	onChange: (email: string) => void;
}

/** Gmail's From row, shown when the account can send as more than one address. */
export function FromField({ sendAs, value, onChange }: FromFieldProps) {
	const { t } = useLingui();
	if (sendAs.length < 2) return null;
	return (
		<label className="flex h-9 items-center gap-2 border-b border-border px-3 text-[13px]">
			<span className="text-muted-foreground">{t({ message: "From" })}</span>
			<select
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
			>
				{sendAs.map((alias) => (
					<option key={alias.email} value={alias.email}>
						{formatRecipient({ name: alias.name, email: alias.email })}
					</option>
				))}
			</select>
		</label>
	);
}
