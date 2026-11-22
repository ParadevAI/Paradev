import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { LuHash, LuLock } from "react-icons/lu";

type Visibility = "public" | "private";

interface SettingsTabProps {
	visibility: Visibility;
	onChange: (changes: { visibility?: Visibility }) => void;
	onArchive: () => void;
}

export function SettingsTab({
	visibility,
	onChange,
	onArchive,
}: SettingsTabProps) {
	const { t } = useLingui();
	return (
		<div className="flex flex-col gap-4">
			<div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
				<div className="flex items-center justify-between gap-4 px-4 py-3">
					<span className="text-sm font-semibold">
						<Trans>Visibility</Trans>
					</span>
					<Select
						value={visibility}
						onValueChange={(value) =>
							onChange({ visibility: value as Visibility })
						}
					>
						<SelectTrigger className="h-8 w-56">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="public">
								<span className="flex items-center gap-2">
									<LuHash className="size-3.5 text-muted-foreground" />
									{t({ message: "Public" })}
								</span>
							</SelectItem>
							<SelectItem value="private">
								<span className="flex items-center gap-2">
									<LuLock className="size-3.5 text-muted-foreground" />
									{t({ message: "Private" })}
								</span>
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="overflow-hidden rounded-lg border border-border bg-background px-4 py-3">
				<Button variant="destructive" size="sm" onClick={onArchive}>
					<Trans>Archive channel</Trans>
				</Button>
			</div>
		</div>
	);
}
