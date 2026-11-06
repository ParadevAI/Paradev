import { Trans, useLingui } from "@lingui/react/macro";
import { LaptopMinimal, Smartphone, Tablet } from "lucide-react";
import { CloudSky } from "../CloudSky";
import { DeviceChip } from "./components/DeviceChip";
import { SANDBOX_ROWS } from "./constants";

export function CloudGraphic() {
	const { t } = useLingui();

	return (
		<div aria-hidden="true" className="relative mt-12 py-20 sm:mt-16 sm:py-28">
			<CloudSky className="absolute inset-y-0 left-1/2 w-screen -translate-x-1/2" />
			<div className="relative mx-auto max-w-md">
				<div className="overflow-hidden rounded-lg border border-border bg-background shadow-2xl shadow-black/60">
					<div className="flex items-center justify-between border-border border-b px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
						<span className="flex items-center gap-2">
							<span className="size-1.5 rounded-full bg-emerald-500" />
							<Trans>Cloud · us-east</Trans>
						</span>
						<span>
							<Trans>3 running</Trans>
						</span>
					</div>
					<ul className="divide-y divide-border">
						{SANDBOX_ROWS.map((row) => (
							<li
								key={row.branch}
								className="flex items-center justify-between gap-3 px-4 py-3"
							>
								<div className="min-w-0">
									<p className="truncate font-mono text-[12px] text-foreground">
										{row.branch}
									</p>
									<p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
										{row.agent} · {t(row.size)} · {row.spec}
									</p>
								</div>
								{row.status === "working" ? (
									<span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
										<span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
										<Trans>Working</Trans>
									</span>
								) : (
									<span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
										<span className="size-1.5 rounded-full bg-brand" />
										<Trans>Ready for review</Trans>
									</span>
								)}
							</li>
						))}
					</ul>
				</div>
			</div>

			<div className="relative mx-auto mt-10 grid max-w-xl grid-cols-3 gap-3 sm:mt-16">
				<DeviceChip icon={<LaptopMinimal className="size-4" />}>
					<Trans>Laptop closed</Trans>
				</DeviceChip>
				<DeviceChip icon={<Smartphone className="size-4" />}>iPhone</DeviceChip>
				<DeviceChip icon={<Tablet className="size-4" />}>iPad</DeviceChip>
			</div>
		</div>
	);
}
