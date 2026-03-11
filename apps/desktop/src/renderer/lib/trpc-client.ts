import * as TrpcClient from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";
import { env } from "renderer/env.renderer";
import superjson from "superjson";
import { ipcLink } from "trpc-electron/renderer";
import { electronTrpc } from "./electron-trpc";
import { sessionIdLink } from "./session-id-link";

const localBackendUrl = `${env.DESKTOP_BACKEND_URL}/trpc`;
const httpSubscriptionLink = (
	TrpcClient as unknown as {
		httpSubscriptionLink?: (options: {
			url: string;
			transformer: typeof superjson;
		}) => ReturnType<typeof TrpcClient.httpBatchLink>;
	}
).httpSubscriptionLink;

const electronLinks = [sessionIdLink(), ipcLink({ transformer: superjson })];

const webLinks = [
	sessionIdLink(),
	TrpcClient.splitLink({
		condition: (operation) => operation.type === "subscription",
		true: httpSubscriptionLink
			? httpSubscriptionLink({
					url: localBackendUrl,
					transformer: superjson,
				})
			: TrpcClient.httpBatchLink({
					url: localBackendUrl,
					transformer: superjson,
				}),
		false: TrpcClient.httpBatchLink({
			url: localBackendUrl,
			transformer: superjson,
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
