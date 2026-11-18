import { createFileRoute } from "@tanstack/react-router";
import { CloudUsageSettings } from "./components/CloudUsageSettings";

export const Route = createFileRoute("/_authenticated/settings/cloud-usage/")({
	component: CloudUsageSettings,
});
