import * as TrpcClient from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";
import { env } from "renderer/env.renderer";
import superjson from "superjson";
import { ipcLink } from "trpc-electron/renderer";
import { electronTrpc } from "./electron-trpc";
import { sessionIdLink } from "./session-id-link";

const localBackendUrl = `${env.DESKTOP_BACKEND_URL}/trpc`;
const localBackendWsUrl = env.DESKTOP_BACKEND_WS_URL;
const webInFlightGetRequests = new Map<string, Promise<Response>>();

const electronLinks = [sessionIdLink(), ipcLink({ transformer: superjson })];
const webWsClient = TrpcClient.createWSClient({
	url: localBackendWsUrl,
});
const webWsLink = TrpcClient.wsLink<AppRouter>({
	client: webWsClient,
	transformer: superjson,
});

const webFetch = async (
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> => {
	const method = (init?.method ?? "GET").toUpperCase();
	if (method !== "GET" || init?.body) {
		return fetch(input, init);
	}

	const url =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.toString()
				: input.url;
	const key = `${method}:${url}`;
	const existing = webInFlightGetRequests.get(key);
	if (existing) {
		return existing.then((response) => response.clone());
	}

	const request = fetch(input, init).finally(() => {
		webInFlightGetRequests.delete(key);
	});

	webInFlightGetRequests.set(key, request);
	return request.then((response) => response.clone());
};

const webHttpLink = TrpcClient.httpLink({
	url: localBackendUrl,
	transformer: superjson,
	fetch: webFetch,
});

const webBatchLink = TrpcClient.httpBatchLink({
	url: localBackendUrl,
	transformer: superjson,
	maxItems: 20,
	fetch: webFetch,
});

function isTerminalOperation(operation: { path: string }): boolean {
	return operation.path.startsWith("terminal.");
}

function isDirectHttpOperation(operation: { path: string }): boolean {
	return (
		operation.path === "filesystem.readFile" ||
		operation.path === "filesystem.readDirectory" ||
		operation.path === "changes.getStatus" ||
		operation.path === "changes.getBranches" ||
		operation.path === "workspaces.get" ||
		operation.path === "workspaces.getGitHubStatus" ||
		operation.path === "workspaces.getWorktreeInfo"
	);
}

const webLinks = [
	sessionIdLink(),
	TrpcClient.splitLink({
		condition: isTerminalOperation,
		true: webWsLink,
		false: TrpcClient.splitLink({
			condition: isDirectHttpOperation,
			true: webHttpLink,
			false: TrpcClient.splitLink({
				condition: (operation) => operation.type === "subscription",
				true: webWsLink,
				false: webBatchLink,
			}),
		}),
	}),
];

const links = env.DESKTOP_WEB_MODE ? webLinks : electronLinks;

/** Electron tRPC React client for React hooks (used by ElectronTRPCProvider). */
export const electronReactClient = electronTrpc.createClient({
	links,
});

/** Electron tRPC proxy client for imperative calls from stores/utilities. */
export const electronTrpcClient = TrpcClient.createTRPCProxyClient<AppRouter>({
	links,
});
