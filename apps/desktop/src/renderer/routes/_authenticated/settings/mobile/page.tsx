import { createFileRoute } from "@tanstack/react-router";
import { MobileSettings } from "./components/MobileSettings";

export const Route = createFileRoute("/_authenticated/settings/mobile/")({
	component: MobileSettings,
});
