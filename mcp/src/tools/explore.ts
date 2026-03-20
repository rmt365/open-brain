import { z } from "zod";
import { CreateCompoundTool, textResult } from "../helpers/create-compound-tool.js";
import { injectContext } from "../helpers/context-injector.js";
import {
  listThoughts,
  getThought,
  searchThoughts,
  getForgottenThoughts,
} from "../helpers/open-brain-client.js";

const THOUGHT_TYPES = [
  "note", "idea", "task", "question", "observation", "decision", "reference", "reflection",
] as const;

const LIFE_AREAS = [
  "craft", "business", "systems", "health", "marriage", "relationships", "creative", "wild", "meta",
] as const;

const ExploreTool = CreateCompoundTool(
  "explore",
  "Browse and explore thoughts in the brain — recent activity, related thoughts, or forgotten gems.",
  {
    recent: {
      description: "Browse recent thoughts chronologically with optional filters",
      handler: async (args) => {
        const thoughtType = args.thought_type as string | undefined;
        const topic = args.topic as string | undefined;
        const sinceDays = (args.since_days as number) ?? 7;
        const limit = (args.limit as number) ?? 20;

        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - sinceDays);

        const response = await listThoughts({
          thought_type: thoughtType,
          topic,
          since: sinceDate.toISOString(),
          limit,
        });

        if (!response.success || !response.data) {
          return textResult(`Failed to browse thoughts: ${response.error || "Unknown error"}`, true);
        }

        const { items, total } = response.data;

        if (items.length === 0) {
          const filters = [];
          if (thoughtType) filters.push(`type=${thoughtType}`);
          if (topic) filters.push(`topic="${topic}"`);
          filters.push(`last ${sinceDays} days`);
          return textResult(`No thoughts found (${filters.join(", ")}).`);
        }

        const lines = items.map((t, i) => {
          const date = new Date(t.created_at).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
            hour: "numeric", minute: "2-digit", hour12: true,
          } as Intl.DateTimeFormatOptions);
          const topicLabel = t.topic ? ` [${t.topic}]` : "";
          return `${i + 1}. [${t.thought_type}]${topicLabel} ${date}\n   ${t.text}\n   ID: ${t.id}`;
        });

        const filterDesc = [];
        if (thoughtType) filterDesc.push(`type: ${thoughtType}`);
        if (topic) filterDesc.push(`topic: "${topic}"`);
        filterDesc.push(`last ${sinceDays} days`);

        const summary = `Showing ${items.length} of ${total} thoughts (${filterDesc.join(", ")}):`;
        const text = `${summary}\n\n${lines.join("\n\n")}`;

        return textResult(await injectContext(text));
      },
    },
    related: {
      description: "Find thoughts related to a given thought by semantic similarity (requires thought_id)",
      required: ["thought_id"],
      handler: async (args) => {
        const thoughtId = args.thought_id as string;
        const limit = (args.limit as number) ?? 5;

        const thoughtResponse = await getThought(thoughtId);
        if (!thoughtResponse.success || !thoughtResponse.data) {
          return textResult(`Thought not found: ${thoughtResponse.error || "Unknown error"}`, true);
        }

        const sourceThought = thoughtResponse.data;
        const searchResponse = await searchThoughts(sourceThought.text, undefined, limit + 1);

        if (!searchResponse.success || !searchResponse.data) {
          return textResult(`Search failed: ${searchResponse.error || "Unknown error"}`, true);
        }

        const related = searchResponse.data
          .filter((r) => r.thought.id !== thoughtId)
          .slice(0, limit);

        const sourceTopic = sourceThought.topic ? ` [${sourceThought.topic}]` : "";
        const sourceDate = new Date(sourceThought.created_at).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        });

        const header = `Source: [${sourceThought.thought_type}]${sourceTopic} ${sourceDate}\n  "${sourceThought.text}"`;

        if (related.length === 0) {
          return textResult(await injectContext(`${header}\n\nNo related thoughts found.`));
        }

        const lines = related.map((r, i) => {
          const t = r.thought;
          const similarity = (r.similarity * 100).toFixed(1);
          const date = new Date(t.created_at).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          });
          const topic = t.topic ? ` [${t.topic}]` : "";
          return `${i + 1}. [${t.thought_type}]${topic} (${similarity}% similar, ${date})\n   ${t.text}\n   ID: ${t.id}`;
        });

        const text = `${header}\n\nFound ${related.length} related thought${related.length !== 1 ? "s" : ""}:\n\n${lines.join("\n\n")}`;
        return textResult(await injectContext(text));
      },
    },
    forgotten: {
      description: "Surface old thoughts you may have forgotten about",
      handler: async (args) => {
        const minAgeDays = (args.min_age_days as number) ?? 30;
        const limit = (args.limit as number) ?? 5;
        const lifeArea = args.life_area as string | undefined;

        const response = await getForgottenThoughts(minAgeDays, limit, lifeArea);

        if (!response.success || !response.data) {
          return textResult(`Failed to surface thoughts: ${response.error || "Unknown error"}`, true);
        }

        const thoughts = response.data;

        if (thoughts.length === 0) {
          return textResult("No forgotten thoughts to surface right now. Either everything is recent, or you've already reviewed everything.");
        }

        const lines = [`${thoughts.length} forgotten thought${thoughts.length !== 1 ? "s" : ""} surfaced:\n`];

        for (const t of thoughts) {
          const age = Math.floor(
            (Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24),
          );
          const area = t.life_area || t.auto_life_area || "unclassified";
          const preview = t.text.length > 150 ? t.text.substring(0, 150) + "..." : t.text;

          lines.push(`---`);
          lines.push(`**[${area}]** ${preview}`);
          lines.push(`Type: ${t.thought_type} | ${age} days ago | ID: ${t.id}`);
        }

        lines.push(`\nThese thoughts have been marked as surfaced and won't appear again for at least 7 days.`);

        return textResult(await injectContext(lines.join("\n")));
      },
    },
  },
  {
    thought_type: z.enum(THOUGHT_TYPES).optional().describe("Filter by thought type (for action: recent)"),
    topic: z.string().optional().describe("Filter by topic (for action: recent)"),
    since_days: z.number().optional().default(7).describe("Show thoughts from last N days (for action: recent, default: 7)"),
    limit: z.number().optional().describe("Maximum results (default varies by action)"),
    thought_id: z.string().optional().describe("Thought ID to find related thoughts for (for action: related)"),
    min_age_days: z.number().optional().default(30).describe("Min age in days for forgotten thoughts (default: 30)"),
    life_area: z.enum(LIFE_AREAS).optional().describe("Filter by life area (for action: forgotten)"),
  },
);

export default ExploreTool;
