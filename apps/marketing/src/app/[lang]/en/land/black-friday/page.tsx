import { notFound } from "next/navigation";
import { initServerI18n } from "@/app/i18n-server";
import { LandingPage } from "../_components/LandingPage";
import { landingCopy } from "../copy";
import { landingMetadata } from "../metadata";

const slug = "black-friday";
export const metadata = landingMetadata(slug);
export default async function Page() {
	const locale = await initServerI18n();
	if (locale !== "en") notFound();
	return <LandingPage copy={landingCopy[slug]} />;
}
