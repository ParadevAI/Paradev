import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/settings/agent-accounts/",
)({
	beforeLoad: () => {
		throw redirect({ to: "/settings/agents", replace: true });
	},
});
