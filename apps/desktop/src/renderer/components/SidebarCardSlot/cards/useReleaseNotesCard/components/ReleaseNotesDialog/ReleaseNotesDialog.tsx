import { Trans, useLingui } from "@lingui/react/macro";
import type { ReleaseNote } from "@superset/shared/release-notes";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@superset/ui/dialog";
import { useState } from "react";
import { LuArrowUpRight, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatReleaseDate } from "../../utils/formatReleaseDate";
import { HIGHLIGHT_ICONS } from "./constants";

interface ReleaseNotesDialogProps {
	open: boolean;
	/** Newest first; the dialog opens on the first one. */
	releases: ReleaseNote[];
	onClose: () => void;
}

export function ReleaseNotesDialog({
	open,
	releases,
	onClose,
}: ReleaseNotesDialogProps) {
	const { t } = useLingui();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const [index, setIndex] = useState(0);
	const release = releases[index];
	if (!release) return null;
	const older = releases[index + 1];
	const newer = releases[index - 1];
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
				className="max-h-[calc(100vh-4rem)] gap-0 overflow-y-auto rounded-xl p-0 sm:max-w-[520px]"
			>
				{release.image && (
					<img
						src={release.image}
						alt=""
						className="m-3 mb-0 aspect-[16/9] w-[calc(100%-1.5rem)] rounded-lg border border-border object-cover"
					/>
				)}

				<div className="px-6 pt-5">
					<DialogTitle className="flex items-baseline gap-2 text-lg font-medium leading-tight">
						{t({ message: `Superset ${version}` })}
						<span className="text-base font-normal text-muted-foreground">
							{formatReleaseDate(release.date, { withYear: true })}
						</span>
					</DialogTitle>
					<DialogDescription className="mt-1">
						{release.title}
					</DialogDescription>
				</div>

				<ul className="flex flex-col gap-4 px-6 pt-5">
					{release.highlights.map((highlight) => {
						const Icon = HIGHLIGHT_ICONS[highlight.icon];
						return (
							<li key={highlight.title} className="flex gap-3.5">
								<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
									<Icon className="size-4" />
								</div>
								<div className="min-w-0">
									<p className="text-sm font-medium">{highlight.title}</p>
									<p className="mt-0.5 text-sm leading-snug text-muted-foreground">
										{highlight.description}
									</p>
								</div>
							</li>
						);
					})}
				</ul>

				<div className="px-6 pt-6">
					<Button className="w-full" onClick={onClose}>
						<Trans>Got it</Trans>
					</Button>
				</div>

				<div className="grid grid-cols-3 items-center px-3 py-3 text-sm">
					<div className="justify-self-start">
						{older && (
							<Button
								variant="ghost"
								size="sm"
								aria-label={t({ message: "Previous release" })}
								onClick={() => setIndex(index + 1)}
							>
								<LuChevronLeft className="size-3.5" />
								{older.version}
							</Button>
						)}
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="justify-self-center text-muted-foreground"
						onClick={() =>
							openUrl.mutate(`${env.NEXT_PUBLIC_MARKETING_URL}/changelog`)
						}
					>
						<Trans>All releases</Trans>
						<LuArrowUpRight className="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="justify-self-end"
						disabled={!newer}
						aria-label={t({ message: "Next release" })}
						onClick={() => setIndex(index - 1)}
					>
						{newer ? newer.version : <Trans>Next</Trans>}
						<LuChevronRight className="size-3.5" />
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
