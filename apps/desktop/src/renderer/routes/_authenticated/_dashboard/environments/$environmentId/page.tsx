import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/environments/$environmentId/",
)({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/settings/environments/$environmentId",
			params: { environmentId: params.environmentId },
			replace: true,
		});
	},
});
