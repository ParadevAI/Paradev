import { Trans } from "@lingui/react/macro";

export function NewMessagesLine() {
	return (
		<div data-new-line className="my-1 flex items-center px-4">
			<div className="h-px flex-1 bg-red-500/70" />
			<span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-red-500">
				<Trans>New</Trans>
			</span>
		</div>
	);
}
