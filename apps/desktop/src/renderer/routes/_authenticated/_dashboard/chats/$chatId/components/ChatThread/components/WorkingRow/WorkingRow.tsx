import { Trans, useLingui } from "@lingui/react/macro";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";

interface WorkingRowProps {
	devId: string;
	name: string;
	/** A group: the Dev's name and face go with its bubble. */
	isGroup: boolean;
	phase: "waking" | "running";
}

/** A Dev at work, at the end of the thread while its turn runs. Its reply arrives as a normal message. */
export function WorkingRow({ devId, name, isGroup, phase }: WorkingRowProps) {
	const { t } = useLingui();
	return (
		<output
			aria-label={t({ message: `${name} is working` })}
			className="flex justify-start px-4 pt-2.5"
		>
			{isGroup && (
				<div className="mr-2 flex w-6 shrink-0 items-end">
					<FaceAvatar seed={devId} size={24} />
				</div>
			)}
			<div className="flex max-w-[70%] min-w-0 flex-col items-start">
				{isGroup && (
					<span className="mb-0.5 px-3.5 text-xs text-muted-foreground">
						{name}
					</span>
				)}
				<div className="animate-pulse rounded-[20px] rounded-bl-md bg-fill-selected px-3.5 py-2 text-sm leading-relaxed text-muted-foreground">
					{phase === "waking" ? (
						<Trans>Waking up…</Trans>
					) : (
						<Trans>Thinking…</Trans>
					)}
				</div>
			</div>
		</output>
	);
}
