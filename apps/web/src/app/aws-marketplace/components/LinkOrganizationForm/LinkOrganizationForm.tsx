"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";

interface LinkOrganizationFormProps {
	claimToken: string;
	organizations: Array<{ id: string; name: string }>;
}

export function LinkOrganizationForm({
	claimToken,
	organizations,
}: LinkOrganizationFormProps) {
	const { t } = useLingui();
	const router = useRouter();
	const trpc = useTRPC();
	const [organizationId, setOrganizationId] = useState(
		organizations.length === 1 ? (organizations[0]?.id ?? "") : "",
	);
	const [failure, setFailure] = useState<string | null>(null);
	const link = useMutation(trpc.awsMarketplace.link.mutationOptions());

	const failureMessages: Record<string, string> = {
		not_found: t({
			message:
				"This link is not valid. Open Paradev again from your AWS Marketplace subscription.",
		}),
		expired: t({
			message:
				"This link has expired. Open Paradev again from your AWS Marketplace subscription.",
		}),
		forbidden: t({
			message: "Only an owner or admin can link this organization.",
		}),
		license_linked_elsewhere: t({
			message: "This subscription is already linked to another organization.",
		}),
		organization_linked_elsewhere: t({
			message:
				"This organization is already linked to another AWS Marketplace subscription.",
		}),
		organization_has_paid_plan: t({
			message:
				"This organization already pays by card. Cancel that plan first, or choose another organization.",
		}),
	};

	const submit = async () => {
		setFailure(null);
		try {
			const result = await link.mutateAsync({ claimToken, organizationId });
			if (result.ok) {
				router.refresh();
				return;
			}
			setFailure(failureMessages[result.reason] ?? null);
		} catch {
			setFailure(
				t({
					message:
						"AWS Marketplace did not respond. Try again in a few minutes.",
				}),
			);
		}
	};

	return (
		<div className="space-y-4 text-left">
			<Select value={organizationId} onValueChange={setOrganizationId}>
				<SelectTrigger
					className="w-full"
					aria-label={t({ message: "Organization" })}
				>
					<SelectValue placeholder={t({ message: "Organization" })} />
				</SelectTrigger>
				<SelectContent>
					{organizations.map((organization) => (
						<SelectItem key={organization.id} value={organization.id}>
							{organization.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				className="w-full"
				size="lg"
				disabled={!organizationId || link.isPending}
				onClick={submit}
			>
				{link.isPending ? (
					<Trans>Linking...</Trans>
				) : (
					<Trans>Link organization</Trans>
				)}
			</Button>
			{failure && <p className="text-sm text-destructive">{failure}</p>}
		</div>
	);
}
