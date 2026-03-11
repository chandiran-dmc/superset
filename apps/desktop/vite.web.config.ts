import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import reactPlugin from "@vitejs/plugin-react";
import { config } from "dotenv";
import { defineConfig } from "vite";
import tsconfigPathsPlugin from "vite-tsconfig-paths";
import { resources } from "./package.json";
import { defineEnv, htmlEnvTransformPlugin } from "./vite/helpers";

// override: true ensures .env values take precedence over inherited env vars
config({ path: resolve(__dirname, "../../.env"), override: true, quiet: true });

const WEB_FRONTEND_PORT = Number(
	process.env.DESKTOP_WEB_FRONTEND_PORT ?? "3210",
);

const tsconfigPaths = tsconfigPathsPlugin({
	projects: [resolve("tsconfig.json")],
});

export default defineConfig({
	root: resolve("src/renderer"),

	define: {
		"process.env.NODE_ENV": defineEnv(process.env.NODE_ENV, "development"),
		"process.env.SKIP_ENV_VALIDATION": defineEnv(
			process.env.SKIP_ENV_VALIDATION,
			"1",
		),
		"process.platform": defineEnv(process.platform),
		"process.env.NEXT_PUBLIC_API_URL": defineEnv(
			process.env.NEXT_PUBLIC_API_URL,
			"https://api.superset.sh",
		),
		"process.env.NEXT_PUBLIC_WEB_URL": defineEnv(
			process.env.NEXT_PUBLIC_WEB_URL,
			"https://app.superset.sh",
		),
		"process.env.NEXT_PUBLIC_ELECTRIC_URL": defineEnv(
			process.env.NEXT_PUBLIC_ELECTRIC_URL,
			"https://electric-proxy.avi-6ac.workers.dev",
		),
		"process.env.NEXT_PUBLIC_DOCS_URL": defineEnv(
			process.env.NEXT_PUBLIC_DOCS_URL,
			"https://docs.superset.sh",
		),
		"process.env.DESKTOP_BACKEND_URL": defineEnv(
			process.env.DESKTOP_BACKEND_URL,
			"http://127.0.0.1:3211",
		),
		"import.meta.env.DESKTOP_WEB_MODE": defineEnv(
			process.env.DESKTOP_WEB_MODE,
			"1",
		),
		"import.meta.env.NEXT_PUBLIC_POSTHOG_KEY": defineEnv(
			process.env.NEXT_PUBLIC_POSTHOG_KEY,
		),
		"import.meta.env.NEXT_PUBLIC_POSTHOG_HOST": defineEnv(
			process.env.NEXT_PUBLIC_POSTHOG_HOST,
		),
		"import.meta.env.SENTRY_DSN_DESKTOP": defineEnv(
			process.env.SENTRY_DSN_DESKTOP,
		),
		"import.meta.env.NEXT_PUBLIC_OUTLIT_KEY": defineEnv(
			process.env.NEXT_PUBLIC_OUTLIT_KEY,
		),
	},

	server: {
		host: "0.0.0.0",
		port: WEB_FRONTEND_PORT,
		strictPort: true,
	},

	plugins: [
		tanstackRouter({
			target: "react",
			routesDirectory: resolve("src/renderer/routes"),
			generatedRouteTree: resolve("src/renderer/routeTree.gen.ts"),
			indexToken: "page",
			routeToken: "layout",
			autoCodeSplitting: true,
			routeFileIgnorePattern:
				"^(?!(__root|page|layout)\\.tsx$).*\\.(tsx?|jsx?)$",
		}),
		tsconfigPaths,
		tailwindcss(),
		reactPlugin(),
		htmlEnvTransformPlugin(),
	],

	publicDir: resolve(resources, "public"),

	build: {
		sourcemap: true,
		outDir: resolve("dist-web"),
		rollupOptions: {
			input: {
				index: resolve("src/renderer/index.html"),
			},
		},
	},
});
