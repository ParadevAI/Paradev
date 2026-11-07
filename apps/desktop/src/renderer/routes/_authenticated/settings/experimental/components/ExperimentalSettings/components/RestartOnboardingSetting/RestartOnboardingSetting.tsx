import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { useNavigate } from "@tanstack/react-router";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useOnboardingRestartStore } from "renderer/routes/_authenticated/stores/onboardingRestartStore";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function RestartOnboardingSetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const navigate = useNavigate();
	const startRestart = useOnboardingRestartStore((s) => s.start);

	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label className="text-sm font-medium">
					<HighlightText
						text={t({ message: "Restart onboarding" })}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<HighlightText
						text={t({
							message:
								"Go through the first-run steps again. Your projects and settings stay as they are.",
						})}
						query={searchQuery}
					/>
				</p>
			</div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="shrink-0"
				onClick={() => {
					startRestart();
					void navigate({ to: "/onboarding" });
				}}
			>
				<Trans>Restart</Trans>
			</Button>
		</div>
	);
}
