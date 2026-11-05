import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { useState } from "react";

export function ManualSignIn({
	presetId,
	label,
	manualOn,
	enable,
}: {
	presetId: string;
	label: string;
	manualOn: boolean;
	enable: () => Promise<unknown>;
}) {
	const { t } = useLingui();
	const [saving, setSaving] = useState(false);
	const loginFile =
		presetId === "claude" ? (
			<Trans>
				<code className="rounded bg-muted px-1 py-0.5 font-mono">
					~/.claude/.credentials.json
				</code>{" "}
				or an{" "}
				<code className="rounded bg-muted px-1 py-0.5 font-mono">
					apiKeyHelper
				</code>
			</Trans>
		) : (
			<code className="rounded bg-muted px-1 py-0.5 font-mono">
				~/.codex/auth.json
			</code>
		);

	const handleEnable = async () => {
		setSaving(true);
		try {
			await enable();
			toast.success(t({ message: `${label} is set to manual` }), {
				description: t({
					message:
						"Restart running workspaces so their agents pick up the change.",
				}),
			});
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t({ message: "Could not save the change." }),
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-3">
			<p className="text-muted-foreground">
				<Trans>
					Paradev holds no credential for {label} and adds none to your cloud
					workspaces when they start, restart or wake. A script you run inside
					the workspace keeps {loginFile} up to date. If it stops, {label} stays
					signed out until your script signs it in again.
				</Trans>
			</p>
			{manualOn ? null : (
				<p className="text-muted-foreground">
					<Trans>
						Choosing this removes any credential saved here for {label}.
					</Trans>
				</p>
			)}
			{manualOn ? null : (
				<div className="flex justify-end">
					<Button
						className="grid place-items-center *:[grid-area:1/1]"
						disabled={saving}
						onClick={() => void handleEnable()}
						size="sm"
					>
						<span className={saving ? "invisible" : undefined}>
							<Trans>Use manual sign-in</Trans>
						</span>
						{saving ? <Spinner /> : null}
					</Button>
				</div>
			)}
		</div>
	);
}
