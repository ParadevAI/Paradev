import { useLingui } from "@lingui/react/macro";
import Image from "next/image";
import { AutomationWindow } from "./components/AutomationWindow";
import { ReviewCard } from "./components/ReviewCard";

export function LaunchWatchDemo() {
	const { t } = useLingui();

	return (
		<div className="mt-14">
			<div className="hidden overflow-hidden border border-border md:block">
				<Image
					src="/automations/launch-watch-flow.webp"
					alt={t`The Launch watch automation with a Sentry trigger and a daily schedule, its two runs, and the draft pull request the agent opened.`}
					width={3000}
					height={1020}
					sizes="(min-width: 1216px) 1152px, 100vw"
					priority
					className="h-auto w-full"
				/>
			</div>
			<div aria-hidden="true" className="md:hidden">
				<AutomationWindow />
				<ReviewCard />
			</div>
		</div>
	);
}
