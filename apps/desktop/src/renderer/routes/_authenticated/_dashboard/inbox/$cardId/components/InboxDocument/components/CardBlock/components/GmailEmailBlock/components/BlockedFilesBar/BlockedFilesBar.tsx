import { Plural, Trans } from "@lingui/react/macro";
import { formatList } from "@superset/i18n/format";
import { LuShieldAlert } from "react-icons/lu";

interface BlockedFilesBarProps {
	names: string[];
	pending: boolean;
	onRemoveAndSend: () => void;
}

/** Gmail never sends a blocked file, so Send waits until they are gone; this says why and offers to drop them and send. */
export function BlockedFilesBar({
	names,
	pending,
	onRemoveAndSend,
}: BlockedFilesBarProps) {
	return (
		<div
			role="alert"
			className="mx-3 mt-2 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-foreground"
		>
			<LuShieldAlert className="size-4 shrink-0 text-destructive" />
			<span className="min-w-0 flex-1">
				<Plural
					value={names.length}
					one={`Gmail blocks ${formatList(names)} for security reasons, so it can't be sent.`}
					other={`Gmail blocks ${formatList(names)} for security reasons, so they can't be sent.`}
				/>
			</span>
			<button
				type="button"
				disabled={pending}
				onClick={onRemoveAndSend}
				className="shrink-0 rounded-md px-2 py-1 font-medium text-blue-600 hover:bg-fill-hover disabled:opacity-50 dark:text-sky-400"
			>
				<Trans>Remove blocked files and send</Trans>
			</button>
		</div>
	);
}
