import { createChatMastraServiceClient } from "@superset/chat-mastra/client";
import type { ChatMastraServiceRouter } from "@superset/chat-mastra/server/trpc";
import * as TrpcClient from "@trpc/client";
import type { TRPCLink } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { env } from "renderer/env.renderer";
import { sessionIdLink } from "renderer/lib/session-id-link";
import superjson from "superjson";
import { ipcLink } from "trpc-electron/renderer";

/** Prepends a router prefix so a standalone client can call a nested Electron router. */
function prefixLink<TRouter extends AnyRouter>(
	prefix: string,
): TRPCLink<TRouter> {
	return () =>
		({ op, next }) =>
			observable((observer) =>
				next({ ...op, path: `${prefix}.${op.path}` }).subscribe(observer),
			);
}

const localBackendUrl = `${env.DESKTOP_BACKEND_URL}/trpc`;
const httpSubscriptionLink = (
	TrpcClient as unknown as {
		httpSubscriptionLink?: (options: {
			url: string;
			transformer: typeof superjson;
		}) => ReturnType<typeof TrpcClient.httpBatchLink>;
	}
).httpSubscriptionLink;

export function createChatMastraServiceIpcClient() {
	const transportLink = env.DESKTOP_WEB_MODE
		? TrpcClient.splitLink({
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
			})
		: ipcLink({ transformer: superjson });

	return createChatMastraServiceClient({
		links: [
			prefixLink<ChatMastraServiceRouter>("chatMastraService"),
			sessionIdLink(),
			transportLink,
		],
	});
}
