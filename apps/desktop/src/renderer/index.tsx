import React from "react";
import ReactDom from "react-dom/client";

import { AppRoutes } from "./routes";

import "./globals.css";

ReactDom.createRoot(document.querySelector("app") as HTMLElement).render(
	<React.StrictMode>
		<AppRoutes />
	</React.StrictMode>,
);
