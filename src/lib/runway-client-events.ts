import { clientTool, type ClientEventsFrom } from "@runwayml/avatars-react/api";

export const showArticleOverlayTool = clientTool("show_article_overlay", {
  description:
    "Use this only when the visitor explicitly asks to open, read, inspect, or view the article, post, source, newsletter, or original write-up behind the current answer. Provide a short articleHint that captures the title, author, source, or topic so the client can surface the right reading link. Do not call this for normal conversation.",
  args: {} as {
    articleHint: string;
    reason?: string;
    ctaLabel?: string;
  },
});

export const runwayClientEventTools = [showArticleOverlayTool] as const;

export type RunwayLiveClientEvent = ClientEventsFrom<typeof runwayClientEventTools>;

export type ShowArticleOverlayArgs = Extract<
  RunwayLiveClientEvent,
  { tool: "show_article_overlay" }
>["args"];
