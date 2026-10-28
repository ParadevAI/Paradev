import { Trans, useLingui } from "@lingui/react/macro";
import { CopyButton } from "../../../../../../../../../CopyButton";

export function SignInCommand({ command }: { command: string | undefined }) {
	const { t } = useLingui();
	if (!command) {
		return (
			<p className="text-muted-foreground">
				<Trans>Sign in to the agent in a terminal, then continue.</Trans>
			</p>
		);
	}
	return (
		<div className="flex flex-col gap-1">
			<p className="text-muted-foreground">
				<Trans>Run this in a terminal, then continue:</Trans>
			</p>
			<div className="flex min-w-0 items-center gap-1 rounded-md border bg-background/60 py-1 pr-1 pl-2 font-mono text-[12px]">
				<code className="min-w-0 flex-1 select-all wrap-anywhere">
					{command}
				</code>
				<CopyButton label={t({ message: "Copy command" })} text={command} />
			</div>
		</div>
	);
}
