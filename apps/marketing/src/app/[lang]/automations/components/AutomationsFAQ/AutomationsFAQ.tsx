import { Trans } from "@lingui/react/macro";
import { FAQDisclosure } from "../../../components/FAQDisclosure";

export function AutomationsFAQ() {
	return (
		<section className="mt-24 grid gap-8 sm:mt-32 lg:grid-cols-[2fr_3fr] lg:gap-24">
			<h2 className="font-medium text-3xl text-foreground tracking-tight">
				<Trans>Questions</Trans>
			</h2>
			<div className="border-border border-t">
				<FAQDisclosure
					name="automations-faq"
					compact
					question={<Trans>Which plans include automations?</Trans>}
				>
					<p>
						<Trans>
							Pro and Enterprise. Microsoft Teams triggers need Enterprise. If
							you downgrade, your automations stay but stop running.
						</Trans>
					</p>
				</FAQDisclosure>
				<FAQDisclosure
					name="automations-faq"
					compact
					question={
						<Trans>What if my Mac is offline when a trigger fires?</Trans>
					}
				>
					<p>
						<Trans>
							That run is missed and isn't retried. Use Run now to start it
							later.
						</Trans>
					</p>
				</FAQDisclosure>
				<FAQDisclosure
					name="automations-faq"
					compact
					question={<Trans>Which agents can run an automation?</Trans>}
				>
					<p>
						<Trans>
							Any agent you've set up in Superset, such as Claude Code or Codex.
						</Trans>
					</p>
				</FAQDisclosure>
				<FAQDisclosure
					name="automations-faq"
					compact
					question={<Trans>How many triggers can one automation have?</Trans>}
				>
					<p>
						<Trans>Up to 25. A run starts when any one of them fires.</Trans>
					</p>
				</FAQDisclosure>
				<FAQDisclosure
					name="automations-faq"
					compact
					question={<Trans>Can I create automations from a script?</Trans>}
				>
					<p>
						<Trans>
							Yes. Use superset automations in the CLI to create, run, and pause
							them.
						</Trans>
					</p>
				</FAQDisclosure>
			</div>
		</section>
	);
}
