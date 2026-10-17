// SPDX-License-Identifier: Apache-2.0
//
// Bun-native twin of src/x/src/news.rs: Explore tab parsing (and, with bun-net, fetching).

import { bunLocal } from "./bun-local";

type Json = Record<string, any>;

export interface BunNewsItem {
  id: string;
  headline: string;
  category: string;
  time_ago?: string;
  post_count?: number;
  description?: string;
  url?: string;
}

export const NEWS_TABS: Record<string, string> = {
  forYou: "VGltZWxpbmU6DAC2CwABAAAAB2Zvcl95b3UAAA==",
  "for-you": "VGltZWxpbmU6DAC2CwABAAAAB2Zvcl95b3UAAA==",
  for_you: "VGltZWxpbmU6DAC2CwABAAAAB2Zvcl95b3UAAA==",
  trending: "VGltZWxpbmU6DAC2CwABAAAACHRyZW5kaW5nAAA=",
  news: "VGltZWxpbmU6DAC2CwABAAAABG5ld3MAAA==",
  sports: "VGltZWxpbmU6DAC2CwABAAAABnNwb3J0cwAA",
  entertainment: "VGltZWxpbmU6DAC2CwABAAAADWVudGVydGFpbm1lbnQAAA==",
};

export const DEFAULT_NEWS_TABS = ["forYou", "news", "sports", "entertainment"];

const postCount = (text: string): number | null => bunLocal("parse_post_count", { text }).data as number | null;

export function parseNewsItem(ic: Json, entryId: string, aiOnly: boolean): BunNewsItem | null {
  const headline = ic?.name ?? ic?.title;
  if (typeof headline !== "string" || !headline) return null;
  const meta = ic.trend_metadata;
  const url: string | undefined = ic.trend_url?.url ?? meta?.url?.url;
  const social: string = ic.social_context?.text ?? "";
  const hasNews = social.includes("News") || social.includes("hours ago");
  const fullSentence = headline.split(/\s+/).filter(Boolean).length >= 5;
  const isAi = ic.is_ai_trend === true || (fullSentence && hasNews);
  if (aiOnly && !isAi) return null;

  let category = "Trending";
  let time_ago: string | undefined;
  let post_count: number | undefined;
  if (social) {
    for (const part of social.split("·").map(p => p.trim())) {
      if (part.includes("ago")) time_ago = part;
      else if (part.toLowerCase().includes("post")) post_count = postCount(part) ?? undefined;
      else if (part) category = part;
    }
  }
  const fromMeta = typeof meta?.meta_description === "string" ? postCount(meta.meta_description) : null;
  if (fromMeta !== null) post_count = fromMeta;
  if (typeof meta?.domain_context === "string" && (category === "Trending" || category === "News")) {
    category = meta.domain_context;
  }
  const item: BunNewsItem = {
    id: url ?? `${entryId}-${headline}`.replaceAll(" ", "_"),
    headline,
    category: isAi ? `AI · ${category}` : category,
  };
  if (time_ago) item.time_ago = time_ago;
  if (post_count !== undefined) item.post_count = post_count;
  if (typeof ic.description === "string") item.description = ic.description;
  if (url) item.url = url;
  return item;
}

export function parseTabItems(data: Json, maxCount: number, aiOnly: boolean): BunNewsItem[] {
  const items: BunNewsItem[] = [];
  const instructions = data?.data?.timeline?.timeline?.instructions;
  if (!Array.isArray(instructions)) return items;
  for (const instruction of instructions) {
    const entries: Json[] = Array.isArray(instruction.entries)
      ? instruction.entries
      : instruction.entry
        ? [instruction.entry]
        : [];
    for (const entry of entries) {
      if (items.length >= maxCount) return items;
      const entryId = entry.entryId ?? "";
      const content = entry.content;
      if (!content) continue;
      if (content.itemContent) {
        const item = parseNewsItem(content.itemContent, entryId, aiOnly);
        if (item) items.push(item);
      }
      for (const data of Array.isArray(content.items) ? content.items : []) {
        if (items.length >= maxCount) return items;
        const ic = data.itemContent ?? data.item?.itemContent;
        const item = ic ? parseNewsItem(ic, entryId, aiOnly) : null;
        if (item) items.push(item);
      }
    }
  }
  return items;
}
