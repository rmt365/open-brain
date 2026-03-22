import { z } from "zod";
import { CreateCompoundTool, textResult } from "../helpers/create-compound-tool.js";
import {
  upsertConfigArtifact,
  listConfigProfiles,
  listProfileArtifacts,
  findByPurpose,
  updatePreference,
  deletePreference,
} from "../helpers/open-brain-client.js";

const ARTIFACT_TYPES = [
  "claude-md", "mcp-server", "sub-agent", "settings", "hook", "tool-config",
] as const;

const CONSTRAINT_TYPES = [
  "domain rule", "quality standard", "business logic", "formatting",
] as const;

const ConfigTool = CreateCompoundTool(
  "config",
  `Config artifact management — store, retrieve, and compare project configurations across profiles.

Workflow:
- To capture a project's config: Read local files (CLAUDE.md, .mcp.json, .claude/settings.json), then use store action for each artifact with the project name as domain.
- For .mcp.json, store each MCP server entry as a separate artifact (artifact_type: mcp-server) so they can be mixed and matched.
- To apply configs: Use get_profile to list artifacts, present each to the user for approval, then write approved ones to project files.
- To detect overlap: Use compare with multiple domains to find artifacts sharing the same purpose.
- To update: Re-read the local file and use update action with the artifact's ID.`,
  {
    store: {
      description: "Store a config artifact (upserts by domain + name). Requires: preference_name, content, domain, artifact_type. Optional: purpose, constraint_type.",
      required: ["preference_name", "content", "domain", "artifact_type"],
      handler: async (args) => {
        const response = await upsertConfigArtifact({
          preference_name: args.preference_name as string,
          domain: args.domain as string,
          content: args.content as string,
          artifact_type: args.artifact_type as string,
          purpose: args.purpose as string | undefined,
          constraint_type: args.constraint_type as string | undefined,
        });

        if (!response.success || !response.data) {
          return textResult(`Failed to store artifact: ${response.error || "Unknown error"}`, true);
        }

        const p = response.data;
        const preview = p.content ? p.content.substring(0, 100) + (p.content.length > 100 ? "..." : "") : "";
        return textResult(
          `Config artifact stored: "${p.preference_name}" (${p.domain})\n` +
          `  Type: ${p.artifact_type}\n` +
          (p.purpose ? `  Purpose: ${p.purpose}\n` : "") +
          `  ${preview}`,
        );
      },
    },
    list_profiles: {
      description: "List all config profiles (domains with config artifacts) and their artifact counts by type.",
      handler: async () => {
        const response = await listConfigProfiles();

        if (!response.success || !response.data) {
          return textResult(`Failed to list profiles: ${response.error || "Unknown error"}`, true);
        }

        const profiles = response.data;
        if (profiles.length === 0) {
          return textResult("No config profiles found. Use store action to create one.");
        }

        const lines = ["Config profiles:", ""];
        for (const p of profiles) {
          const types = Object.entries(p.by_type)
            .map(([type, count]) => `${type}: ${count}`)
            .join(", ");
          lines.push(`  ${p.domain} (${p.total} artifacts) — ${types}`);
        }

        return textResult(lines.join("\n"));
      },
    },
    get_profile: {
      description: "Get all artifacts in a profile/domain. Requires: domain. Optional: artifact_type to filter.",
      required: ["domain"],
      handler: async (args) => {
        const response = await listProfileArtifacts(
          args.domain as string,
          args.artifact_type as string | undefined,
        );

        if (!response.success || !response.data) {
          return textResult(`Failed to get profile: ${response.error || "Unknown error"}`, true);
        }

        const artifacts = response.data.filter((a) => a.artifact_type !== null);
        if (artifacts.length === 0) {
          return textResult(`No config artifacts found in domain "${args.domain}".`);
        }

        const lines = [`Profile "${args.domain}" — ${artifacts.length} artifacts:`, ""];
        for (const a of artifacts) {
          const preview = a.content ? a.content.substring(0, 80).replace(/\n/g, " ") + (a.content.length > 80 ? "..." : "") : "(empty)";
          lines.push(`  [${a.artifact_type}] ${a.preference_name} (id: ${a.id})`);
          if (a.purpose) lines.push(`    Purpose: ${a.purpose}`);
          lines.push(`    ${preview}`);
          lines.push("");
        }

        return textResult(lines.join("\n"));
      },
    },
    compare: {
      description: "Compare profiles for overlapping purposes. Requires: domains (comma-separated, e.g. 'project-a,project-b'). Returns artifacts grouped by purpose.",
      required: ["domains"],
      handler: async (args) => {
        const domainList = (args.domains as string).split(",").map((d) => d.trim());
        if (domainList.length < 2) {
          return textResult("Provide at least 2 comma-separated domains to compare.", true);
        }

        // Get all artifacts from each domain
        const allArtifacts: Array<{ domain: string; name: string; purpose: string; artifact_type: string; id: string }> = [];

        for (const domain of domainList) {
          const response = await listProfileArtifacts(domain);
          if (response.success && response.data) {
            for (const a of response.data) {
              if (a.artifact_type && a.purpose) {
                allArtifacts.push({
                  domain,
                  name: a.preference_name,
                  purpose: a.purpose,
                  artifact_type: a.artifact_type,
                  id: a.id,
                });
              }
            }
          }
        }

        // Group by purpose
        const byPurpose: Record<string, typeof allArtifacts> = {};
        for (const a of allArtifacts) {
          if (!byPurpose[a.purpose]) byPurpose[a.purpose] = [];
          byPurpose[a.purpose].push(a);
        }

        // Find overlaps (purpose appears in multiple domains)
        const overlaps = Object.entries(byPurpose).filter(
          ([, artifacts]) => {
            const domains = new Set(artifacts.map((a) => a.domain));
            return domains.size > 1;
          },
        );

        if (overlaps.length === 0) {
          return textResult(
            `No overlapping purposes found between ${domainList.join(", ")}.\n` +
            `Total artifacts with purpose tags: ${allArtifacts.length}`,
          );
        }

        const lines = [`Found ${overlaps.length} overlapping purpose(s) between ${domainList.join(", ")}:`, ""];
        for (const [purpose, artifacts] of overlaps) {
          lines.push(`  Purpose: "${purpose}"`);
          for (const a of artifacts) {
            lines.push(`    [${a.domain}] ${a.name} (${a.artifact_type}, id: ${a.id})`);
          }
          lines.push("");
        }
        lines.push("Use get_profile to inspect individual artifacts and decide which to keep.");

        return textResult(lines.join("\n"));
      },
    },
    update: {
      description: "Update an existing artifact's content. Requires: preference_id, content. Optional: purpose, domain.",
      required: ["preference_id", "content"],
      handler: async (args) => {
        const data: Record<string, unknown> = {
          content: args.content as string,
        };
        if (args.purpose !== undefined) data.purpose = args.purpose;
        if (args.domain !== undefined) data.domain = args.domain;

        const response = await updatePreference(args.preference_id as string, data);

        if (!response.success || !response.data) {
          return textResult(`Failed to update artifact: ${response.error || "Not found"}`, true);
        }

        const p = response.data;
        return textResult(
          `Artifact updated: "${p.preference_name}" (${p.domain})\n` +
          `  Type: ${p.artifact_type}\n` +
          (p.purpose ? `  Purpose: ${p.purpose}\n` : "") +
          `  Content updated (${p.content?.length || 0} chars)`,
        );
      },
    },
    remove: {
      description: "Delete a config artifact. Requires: preference_id.",
      required: ["preference_id"],
      handler: async (args) => {
        const response = await deletePreference(args.preference_id as string);

        if (!response.success) {
          return textResult(`Failed to remove artifact: ${response.error || "Not found"}`, true);
        }

        return textResult(`Artifact ${args.preference_id} removed.`);
      },
    },
  },
  {
    preference_name: z.string().optional().describe("Short name for the artifact (e.g. 'code-simplifier', 'project-instructions')"),
    content: z.string().optional().describe("The config content (file contents, JSON config, markdown, etc.)"),
    domain: z.string().optional().describe("Profile/project name to store under (e.g. 'my-project', 'devtools')"),
    artifact_type: z.enum(ARTIFACT_TYPES).optional().describe("Type of config artifact"),
    purpose: z.string().optional().describe("Semantic purpose tag for overlap detection (e.g. 'code-simplification', 'testing', 'linting')"),
    constraint_type: z.enum(CONSTRAINT_TYPES).optional().describe("Constraint classification"),
    domains: z.string().optional().describe("Comma-separated domain names for compare action"),
    preference_id: z.string().optional().describe("Artifact ID for update/remove actions"),
  },
);

export default ConfigTool;
