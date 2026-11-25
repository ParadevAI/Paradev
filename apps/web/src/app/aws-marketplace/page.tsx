import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Button } from "@superset/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { initServerI18n } from "@/lib/i18n-server";
import { api } from "../../trpc/server";
import { LinkOrganizationForm } from "./components/LinkOrganizationForm";
import { MarketplaceNotice } from "./components/MarketplaceNotice";

export const metadata: Metadata = { referrer: "no-referrer" };

interface PageProps {
	searchParams: Promise<{ claim?: string; error?: string }>;
}

const INVALID = msg({
	message:
		"This link is not valid. Open Paradev again from your AWS Marketplace subscription.",
});
const EXPIRED = msg({
	message:
		"This link has expired. Open Paradev again from your AWS Marketplace subscription.",
});
const UNAVAILABLE = msg({
	message: "AWS Marketplace did not respond. Try again in a few minutes.",
});

const FAILURES: Record<string, MessageDescriptor> = {
	invalid_token: INVALID,
	wrong_product: INVALID,
	missing_license: INVALID,
	not_found: INVALID,
	expired_token: EXPIRED,
	expired: EXPIRED,
	unavailable: UNAVAILABLE,
};

export default async function AwsMarketplacePage({ searchParams }: PageProps) {
	const i18n = await initServerI18n();
	const { claim, error } = await searchParams;
	const dashboardButton = (
		<Button asChild variant="outline">
			<Link href="/">{i18n._(msg({ message: "Return to dashboard" }))}</Link>
		</Button>
	);
	const failed = (reason: string) => (
		<MarketplaceNotice
			title={i18n._(
				msg({
					message: "We couldn't confirm your AWS Marketplace subscription",
				}),
			)}
			description={i18n._(FAILURES[reason] ?? INVALID)}
		>
			{dashboardButton}
		</MarketplaceNotice>
	);

	if (error || !claim) return failed(error ?? "invalid_token");

	const trpc = await api();
	const state = await trpc.awsMarketplace.claim.query({ claimToken: claim });

	if (state.status === "not_found" || state.status === "expired") {
		return failed(state.status);
	}

	if (state.status === "linked") {
		return (
			<MarketplaceNotice
				title={i18n._(
					msg({ message: "Your AWS Marketplace subscription is active" }),
				)}
				description={
					state.organization
						? i18n._({
								...msg({ message: "It is linked to {organization}." }),
								values: { organization: state.organization.name },
							})
						: i18n._(
								msg({
									message:
										"It is already linked to an organization you are not a member of. Ask its owner to invite you.",
								}),
							)
				}
			>
				{dashboardButton}
			</MarketplaceNotice>
		);
	}

	return (
		<MarketplaceNotice
			title={i18n._(
				msg({ message: "Connect your AWS Marketplace subscription" }),
			)}
			description={
				state.organizations.length > 0
					? i18n._(
							msg({
								message:
									"Choose the organization that AWS Marketplace will bill. Each subscription links to one organization.",
							}),
						)
					: i18n._(
							msg({
								message:
									"You don't own or administer an organization yet. Create one, then open this link again.",
							}),
						)
			}
		>
			{state.organizations.length > 0 ? (
				<LinkOrganizationForm
					claimToken={claim}
					organizations={state.organizations}
				/>
			) : (
				dashboardButton
			)}
		</MarketplaceNotice>
	);
}
