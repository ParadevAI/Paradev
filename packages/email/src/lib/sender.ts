import { BRAND } from "@superset/shared/brand";
import { env } from "./env";

export const NOREPLY_FROM = `${BRAND.INTRO_NAME} <noreply@${env.EMAIL_SENDING_DOMAIN}>`;
