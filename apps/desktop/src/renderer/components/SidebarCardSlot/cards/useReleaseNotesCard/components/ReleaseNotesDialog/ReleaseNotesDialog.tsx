import { Trans, useLingui } from "@lingui/react/macro";
import type { ReleaseNote } from "@superset/shared/release-notes";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@superset/ui/dialog";
import { cn } from "@superset/ui/utils";
import { LuArrowUpRight } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface ReleaseNotesDialogProps {
	open: boolean;
	release: ReleaseNote;
	onClose: () => void;
}

export function ReleaseNotesDialog({
	open,
	release,
	onClose,
}: ReleaseNotesDialogProps) {
	const { t } = useLingui();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const version = release.version;

	return (
		<Dialog
			modal
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent
				showCloseButton={false}
				className={cn(
					"max-h-[calc(100vh-4rem)] gap-0 overflow-hidden rounded-xl p-0",
					release.image
						? "sm:min-h-[min(400px,calc(100vh-4rem))] sm:max-w-[760px] sm:grid-cols-[1fr_1.05fr]"
						: "sm:max-w-[440px]",
				)}
			>
				<div className="flex min-h-0 flex-col overflow-y-auto px-8 pt-9 pb-7">
					<DialogDescription className="font-mono text-[11px] uppercase tracking-[0.12em]">
						{t({ message: `Paradev ${version}` })}
					</DialogDescription>
					<DialogTitle className="mt-3.5 text-[26px] font-medium leading-[1.12] tracking-tight">
						{release.title}
					</DialogTitle>

					<ul className="mt-6 flex flex-col gap-2.5 text-sm">
						{release.highlights.map((highlight) => (
							<li key={highlight.title}>{highlight.title}</li>
						))}
					</ul>

					<div className="mt-auto flex items-center gap-1.5 pt-7">
						<Button onClick={onClose}>
							<Trans>Got it</Trans>
						</Button>
						<Button
							variant="ghost"
							className="text-muted-foreground"
							onClick={() =>
								openUrl.mutate(`${env.NEXT_PUBLIC_MARKETING_URL}/changelog`)
							}
						>
							<Trans>All releases</Trans>
							<LuArrowUpRight className="size-3.5" />
						</Button>
					</div>
				</div>

				{release.image && (
					<div className="relative hidden overflow-hidden border-l border-border bg-black sm:block">
						<img
							src={release.image}
							alt=""
							className="absolute top-[14%] left-[6%] w-[165%] max-w-none rounded-lg border border-white/10"
						/>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
