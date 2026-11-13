import { createFileRoute, redirect } from "@tanstack/react-router";

// The app restores its last route at boot, so the old path must keep resolving.
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
