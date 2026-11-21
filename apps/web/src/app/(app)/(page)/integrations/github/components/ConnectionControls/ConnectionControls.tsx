"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Plus } from "lucide-react";
import { env } from "@/env";
import { InstallationRow } from "./components/InstallationRow";

interface ConnectionControlsProps {
	organizationId: string;
	installations: Array<{
		id: string;
		accountLogin: string;
		accountType: string;
		suspended: boolean;
	}>;
}

export function ConnectionControls({
	organizationId,
	installations,
}: ConnectionControlsProps) {
	const handleConnect = () => {
		window.location.href = `${env.NEXT_PUBLIC_API_URL}/api/github/install?organizationId=${organizationId}`;
	};

	if (installations.length === 0) {
		return (
			<Button onClick={handleConnect}>
				<Trans>Install GitHub App</Trans>
			</Button>
		);
	}

	return (
		<div className="space-y-3">
			{installations.map((installation) => (
				<InstallationRow
					key={installation.id}
					organizationId={organizationId}
					installation={installation}
				/>
			))}
			<Button variant="outline" onClick={handleConnect}>
				<Plus className="mr-2 size-4" />
				<Trans>Add GitHub organization</Trans>
			</Button>
		</div>
	);
}
