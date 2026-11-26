import { initServerI18n } from "@/app/i18n-server";
import { LandingPage } from "../_components/LandingPage";
import { landingCopy } from "../copy";
import { landingMetadata } from "../metadata";

const slug = "black-friday";
export const metadata = landingMetadata(slug);
export default async function Page() {
	await initServerI18n();
	return <LandingPage copy={landingCopy[slug]} />;
}
