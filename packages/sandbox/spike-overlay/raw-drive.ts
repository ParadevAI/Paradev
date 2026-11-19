// Prints the raw drive JSON the API returns, to see what usage it reports.
import { Drive } from "@vercel/sandbox";
const d: any = await Drive.get({ token: process.env.VERCEL_TOKEN!, teamId: process.env.VERCEL_ORG_ID!, projectId: process.env.OVL_PROJECT_ID ?? "", name: process.argv[2] });
console.log(JSON.stringify(d.drive ?? d, null, 1));
