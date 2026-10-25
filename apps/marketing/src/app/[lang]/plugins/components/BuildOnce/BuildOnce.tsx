import { Trans } from "@lingui/react/macro";
import { AgentTargets } from "./components/AgentTargets";
import { ManifestWindow } from "./components/ManifestWindow";

export function BuildOnce() {
	return (
		<section className="mt-24 sm:mt-32">
			<p className="font-mono text-brand text-xs uppercase tracking-wider">
				<Trans>Build your own</Trans>
			</p>
			<h2 className="mt-4 max-w-3xl font-medium text-3xl text-balance text-foreground tracking-tight sm:text-4xl">
				<Trans>Write once. Runs in every agent.</Trans>
			</h2>
			<p className="mt-5 max-w-xl text-lg text-muted-foreground leading-relaxed">
				<Trans>
					A manifest and a few skill files. Superset puts it where every agent
					looks.
				</Trans>
			</p>
			<div className="mt-12 grid items-stretch gap-6 lg:grid-cols-2">
				<ManifestWindow />
				<AgentTargets />
			</div>
		</section>
	);
}
