/**
 * Publishes the upgrade-nudge email as the Resend template the `upgrade-nudge`
 * automation in sync-automations.ts sends. Run this before that sync.
 *
 * Usage (dry-run by default, pass --apply to create or update and publish):
 *   RESEND_API_KEY=... NEXT_PUBLIC_MARKETING_URL=https://superset.sh \
 *     bun scripts/publish-upgrade-nudge-template.ts [--apply]
 *
 * Resend fills {{{RESEND_UNSUBSCRIBE_URL}}} and adds List-Unsubscribe headers
 * only for automation and broadcast sends, never for emails.send().
 */
import { render } from "@react-email/components";
import { COMPANY } from "@superset/shared/constants";
import { Resend } from "resend";
import { UpgradeNudgeEmail } from "../src/emails/billing/upgrade-nudge";
import { NOREPLY_FROM } from "../src/lib/sender";

const ALIAS = "billing-upgrade-nudge";
const apply = process.argv.includes("--apply");

const html = await render(
	UpgradeNudgeEmail({
		featureName: "{{{featureName}}}",
		upgradeUrl: "{{{upgradeUrl}}}",
		unsubscribeUrl: "{{{RESEND_UNSUBSCRIBE_URL}}}",
	}),
);
const template = {
	name: "Billing: upgrade nudge",
	alias: ALIAS,
	from: NOREPLY_FROM,
	replyTo: COMPANY.MAIL_TO.replace(/^mailto:/, ""),
	subject: "{{{featureName}}} is part of Paradev Pro",
	html,
	variables: [
		{ key: "featureName", type: "string" as const, fallbackValue: "Pro" },
		{ key: "upgradeUrl", type: "string" as const },
	],
};

const resend = new Resend(process.env.RESEND_API_KEY);
const existing = await resend.templates.get(ALIAS);
if (existing.error && existing.error.name !== "not_found") {
	throw new Error(existing.error.message);
}
const id = existing.data?.id;
console.log(
	`${ALIAS}: ${id ? `updating ${id}` : "creating"}, ${html.length} bytes${apply ? "" : " (dry-run, pass --apply)"}`,
);
if (!apply) process.exit(0);

const saved = id
	? await resend.templates.update(id, template)
	: await resend.templates.create(template);
if (saved.error || !saved.data) throw new Error(saved.error?.message);
const published = await resend.templates.publish(saved.data.id);
if (published.error) throw new Error(published.error.message);
console.log(`  published ${saved.data.id}`);
