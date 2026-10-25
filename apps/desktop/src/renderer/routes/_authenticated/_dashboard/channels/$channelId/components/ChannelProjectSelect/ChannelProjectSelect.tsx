import { useLingui } from "@lingui/react/macro";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const NO_PROJECT = "none";

interface ChannelProjectSelectProps {
	value: string | null;
	onChange: (projectId: string | null) => void;
	className?: string;
}

export function ChannelProjectSelect({
	value,
	onChange,
	className,
}: ChannelProjectSelectProps) {
	const { t } = useLingui();
	const organizationId = useActiveOrganizationId();
	const { data: projects = [] } = cloudTrpc.taskProject.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);
	return (
		<Select
			value={value ?? NO_PROJECT}
			onValueChange={(next) => onChange(next === NO_PROJECT ? null : next)}
		>
			<SelectTrigger className={className}>
				<SelectValue placeholder={t({ message: "Link a project" })} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={NO_PROJECT}>
					{t({ message: "No project" })}
				</SelectItem>
				{projects.map((project) => (
					<SelectItem key={project.id} value={project.id}>
						{project.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
