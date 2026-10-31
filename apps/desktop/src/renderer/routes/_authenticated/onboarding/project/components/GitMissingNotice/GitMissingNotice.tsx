import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

const GIT_DOWNLOAD_URL = "https://git-scm.com/downloads";

interface GitMissingNoticeProps {
	needsCommandLineTools: boolean;
	error: string | null;
}

export function GitMissingNotice({
	needsCommandLineTools,
	error,
}: GitMissingNoticeProps) {
	const { t } = useLingui();
	const [installerOpened, setInstallerOpened] = useState(false);
	const installCommandLineTools =
		electronTrpc.system.installCommandLineTools.useMutation();

	const openInstaller = async () => {
		try {
			await installCommandLineTools.mutateAsync();
			setInstallerOpened(true);
		} catch (err) {
			toast.error(t`Could not open Apple's installer`, {
				description: errorMessage(err),
			});
		}
	};

	const detail = needsCommandLineTools
		? installerOpened
			? t`Finish Apple's installer. This page updates when it's done.`
			: t`On a Mac, Git comes with Apple's Command Line Tools.`
		: (error ?? t`Install Git, then come back.`);

	return (
		<div className="flex items-center justify-between gap-4 rounded-lg bg-foreground/[0.05] p-4">
			<div className="min-w-0">
				<p className="font-medium text-foreground text-sm">
					{t`Paradev needs Git to add a project.`}
				</p>
				<p className="mt-1 select-text break-words text-muted-foreground text-xs">
					{detail}
				</p>
			</div>
			{needsCommandLineTools ? (
				<Button
					size="sm"
					className="shrink-0"
					onClick={() => void openInstaller()}
					disabled={installCommandLineTools.isPending}
				>
					{t`Install Command Line Tools`}
				</Button>
			) : (
				!error && (
					<Button
						size="sm"
						className="shrink-0"
						onClick={() =>
							window.open(GIT_DOWNLOAD_URL, "_blank", "noopener,noreferrer")
						}
					>
						{t`Get Git`}
					</Button>
				)
			)}
		</div>
	);
}
