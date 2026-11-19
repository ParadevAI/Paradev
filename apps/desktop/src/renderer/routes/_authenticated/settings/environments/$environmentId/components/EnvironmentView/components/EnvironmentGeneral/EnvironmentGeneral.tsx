import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { MachineSize } from "@superset/shared/billing";
import type { RouterOutputs } from "@superset/trpc";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { SettingsRow } from "renderer/routes/_authenticated/settings/components/SettingsRow";
import { SettingsSection } from "renderer/routes/_authenticated/settings/components/SettingsSection";
import { EnvironmentMachineSize } from "./components/EnvironmentMachineSize";

type Environment = RouterOutputs["environment"]["get"];
type Scope = Environment["scope"];

interface EnvironmentGeneralProps {
	environment: Environment;
}

export function EnvironmentGeneral({ environment }: EnvironmentGeneralProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const [name, setName] = useState(environment.name);
	const [scope, setScope] = useState<Scope>(environment.scope);
	const [machineSize, setMachineSize] = useState<string | null>(
		environment.machineSize,
	);

	useEffect(() => {
		setName(environment.name);
		setScope(environment.scope);
		setMachineSize(environment.machineSize);
	}, [environment.name, environment.scope, environment.machineSize]);

	const update = cloudTrpc.environment.update.useMutation({
		onSuccess: () => utils.environment.invalidate(),
		onError: (error) => {
			toast.error(errorMessage(error));
			setName(environment.name);
			setScope(environment.scope);
			setMachineSize(environment.machineSize);
		},
	});

	const commitName = () => {
		const trimmed = name.trim();
		if (!trimmed) {
			setName(environment.name);
			return;
		}
		if (trimmed !== environment.name) {
			update.mutate({ id: environment.id, name: trimmed });
		}
	};

	return (
		<SettingsSection title={t({ message: "General" })}>
			<div>
				<SettingsRow htmlFor="environment-name" label={t({ message: "Name" })}>
					<Input
						className="w-64"
						id="environment-name"
						maxLength={100}
						onBlur={commitName}
						onChange={(event) => setName(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") event.currentTarget.blur();
							if (event.key === "Escape") {
								setName(environment.name);
								event.currentTarget.blur();
							}
						}}
						value={name}
					/>
				</SettingsRow>
				<SettingsRow
					htmlFor="environment-scope"
					label={t({ message: "Visible to" })}
				>
					<Select
						onValueChange={(value) => {
							const next = value as Scope;
							setScope(next);
							update.mutate({ id: environment.id, scope: next });
						}}
						value={scope}
					>
						<SelectTrigger className="w-64" id="environment-scope">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="organization">
								<Trans>Organization</Trans>
							</SelectItem>
							<SelectItem value="personal">
								<Trans>Only you</Trans>
							</SelectItem>
						</SelectContent>
					</Select>
				</SettingsRow>
				<SettingsRow
					htmlFor="environment-machine-size"
					label={t({ message: "Machine size" })}
				>
					<EnvironmentMachineSize
						className="w-64"
						disabled={update.isPending}
						id="environment-machine-size"
						machineSize={machineSize}
						onChange={(next: MachineSize | null) => {
							setMachineSize(next);
							update.mutate({ id: environment.id, machineSize: next });
						}}
					/>
				</SettingsRow>
			</div>
		</SettingsSection>
	);
}
