import { serve } from "@hono/node-server";
import { trpcServer } from "@hono/trpc-server";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createWebAppRouter } from "lib/trpc/routers/web";
import { applyShellEnvToProcess } from "lib/trpc/routers/workspaces/utils/shell-env";
import { initAppState } from "main/lib/app-state";
import {
	prewarmTerminalRuntime,
	reconcileDaemonSessions,
	restartDaemon,
} from "main/lib/terminal";
import { WebSocketServer } from "ws";

const WEB_BACKEND_PORT = Number(process.env.DESKTOP_WEB_BACKEND_PORT ?? "3211");
const WEB_BACKEND_WS_PORT = Number(
	process.env.DESKTOP_WEB_BACKEND_WS_PORT ?? "3212",
);
const WEB_FRONTEND_ORIGIN =
	process.env.DESKTOP_WEB_FRONTEND_ORIGIN ?? "http://127.0.0.1:3210";

const appRouter = createWebAppRouter();

async function initialize(): Promise<void> {
	await initAppState();
	await applyShellEnvToProcess().catch((error) => {
		console.error("[web-backend] Failed to apply shell env:", error);
	});
	await reconcileDaemonSessions();
	prewarmTerminalRuntime();

	const shouldEnableAgentHooks =
		process.env.DESKTOP_WEB_ENABLE_AGENT_HOOKS === "1";
	if (shouldEnableAgentHooks) {
		try {
			const { setupAgentHooks } = await import("main/lib/agent-setup");
			setupAgentHooks();
		} catch (error) {
			console.error("[web-backend] Failed to set up agent hooks:", error);
		}
	}
}

async function startWebBackend(): Promise<void> {
	await initialize();

	const app = new Hono();

	app.use(
		"*",
		cors({
			origin: [
				WEB_FRONTEND_ORIGIN,
				"http://localhost:3210",
				"http://127.0.0.1:3210",
			],
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: [
				"content-type",
				"authorization",
				"x-trpc-source",
				"trpc-accept",
			],
			credentials: false,
		}),
	);

	app.get("/healthz", (context) => {
		return context.json({
			ok: true,
			mode: "desktop-web",
		});
	});

	app.use(
		"/trpc/*",
		trpcServer({
			router: appRouter,
		}),
	);

	const server = serve(
		{
			fetch: app.fetch,
			port: WEB_BACKEND_PORT,
			hostname: "0.0.0.0",
		},
		(info: { port: number }) => {
			console.log(
				`[web-backend] Listening on http://127.0.0.1:${info.port} (frontend: ${WEB_FRONTEND_ORIGIN})`,
			);
		},
	);

	const wss = new WebSocketServer({
		port: WEB_BACKEND_WS_PORT,
		host: "0.0.0.0",
	});
	const wsHandler = applyWSSHandler({
		wss,
		router: appRouter,
	});
	console.log(
		`[web-backend] tRPC websocket listening on ws://127.0.0.1:${WEB_BACKEND_WS_PORT}`,
	);

	const shutdown = async () => {
		wsHandler.broadcastReconnectNotification();
		wss.close();
		server.close();
		await restartDaemon().catch(() => {
			// Best-effort.
		});
		process.exit(0);
	};

	process.on("SIGINT", () => {
		void shutdown();
	});
	process.on("SIGTERM", () => {
		void shutdown();
	});
}

void startWebBackend().catch((error) => {
	console.error("[web-backend] Failed to start:", error);
	process.exit(1);
});
