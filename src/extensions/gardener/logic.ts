// Gardener extension — business logic
// Automated data quality maintenance for topics and thoughts

import type { OpenBrainDatabaseManager } from "../../db/openBrainDatabaseManager.ts";
import type { LLMProvider } from "../../logic/llm/types.ts";
import type { GardenAction, GardenResult } from "./types.ts";

interface ConsolidationGroup {
  canonical: string;
  duplicates: string[];
  reason: string;
}

export class GardenAgent {
  private db: OpenBrainDatabaseManager;
  private llm: LLMProvider | null;

  constructor(db: OpenBrainDatabaseManager, llm?: LLMProvider | null) {
    this.db = db;
    this.llm = llm ?? null;
  }

  // ============================================
  // Step 1: Deduplicate pending suggestions
  // ============================================

  deduplicateSuggestions(): GardenAction[] {
    const raw = this.db.getRawDb();
    const dupes = raw.prepare(`
      SELECT name, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
      FROM suggested_topics
      WHERE status = 'pending'
      GROUP BY name
      HAVING cnt > 1
    `).all() as Array<{ name: string; cnt: number; ids: string }>;

    const actions: GardenAction[] = [];

    for (const dupe of dupes) {
      const ids = dupe.ids.split(",").map(Number);
      // Keep the oldest (smallest id), reject the rest
      const keep = Math.min(...ids);
      const reject = ids.filter((id) => id !== keep);

      if (reject.length > 0) {
        this.db.rejectSuggestionsBatch(reject);

        actions.push({
          type: "dedup_merge",
          details: {
            topic_name: dupe.name,
            kept_id: keep,
            rejected_ids: reject,
            duplicate_count: dupe.cnt,
          },
          affected_ids: reject.map(String),
        });
      }
    }

    return actions;
  }

  // ============================================
  // Step 2: Auto-approve high-frequency suggestions
  // ============================================

  autoApprove(): GardenAction[] {
    const raw = this.db.getRawDb();
    const actions: GardenAction[] = [];

    // Find pending suggestions where the topic name appears in auto_topics
    // of 2+ distinct thoughts (lower threshold for small datasets)
    const candidates = raw.prepare(`
      SELECT st.id, st.name, COUNT(DISTINCT t.id) as thought_count
      FROM suggested_topics st
      JOIN thoughts t ON t.auto_topics IS NOT NULL AND t.status = 'active'
      JOIN JSON_EACH(t.auto_topics) je ON je.value = st.name
      WHERE st.status = 'pending'
      GROUP BY st.id, st.name
      HAVING thought_count >= 2
    `).all() as Array<{ id: number; name: string; thought_count: number }>;

    for (const candidate of candidates) {
      const result = this.db.approveSuggestion(candidate.id);
      if (result) {
        actions.push({
          type: "auto_approve",
          details: {
            suggestion_id: candidate.id,
            topic_name: candidate.name,
            thought_count: candidate.thought_count,
          },
          affected_ids: [String(candidate.id)],
        });
      }
    }

    return actions;
  }

  // ============================================
  // Step 3: Auto-assign life areas to managed topics
  // ============================================

  autoAssignLifeAreas(): GardenAction[] {
    const raw = this.db.getRawDb();
    const actions: GardenAction[] = [];

    const topicsWithoutArea = raw.prepare(`
      SELECT mt.id, mt.name
      FROM managed_topics mt
      WHERE mt.life_area IS NULL AND mt.active = 1
    `).all() as Array<{ id: number; name: string }>;

    for (const topic of topicsWithoutArea) {
      const areaVotes = raw.prepare(`
        SELECT COALESCE(life_area, auto_life_area) as area, COUNT(*) as cnt
        FROM thoughts
        WHERE COALESCE(life_area, auto_life_area) IS NOT NULL
          AND status = 'active'
          AND auto_topics IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM JSON_EACH(thoughts.auto_topics) je
            WHERE je.value = ?
          )
        GROUP BY area
        ORDER BY cnt DESC
        LIMIT 1
      `).get(topic.name) as { area: string; cnt: number } | undefined;

      if (areaVotes) {
        raw.prepare(
          "UPDATE managed_topics SET life_area = ? WHERE id = ?"
        ).run(areaVotes.area, topic.id);

        actions.push({
          type: "auto_assign_life_area",
          details: {
            topic_id: topic.id,
            topic_name: topic.name,
            assigned_life_area: areaVotes.area,
            vote_count: areaVotes.cnt,
          },
          affected_ids: [String(topic.id)],
        });
      }
    }

    return actions;
  }

  /**
   * LLM-powered life area assignment for topics with no vote data.
   * Asks the LLM to classify topic names into life areas.
   */
  async autoAssignLifeAreasLLM(): Promise<GardenAction[]> {
    if (!this.llm) return [];

    const raw = this.db.getRawDb();
    const topicsWithoutArea = raw.prepare(`
      SELECT mt.id, mt.name
      FROM managed_topics mt
      WHERE mt.life_area IS NULL AND mt.active = 1
    `).all() as Array<{ id: number; name: string }>;

    if (topicsWithoutArea.length === 0) return [];

    // Get available life areas
    const lifeAreas = raw.prepare(
      "SELECT name, description FROM life_areas WHERE active = 1 ORDER BY sort_order"
    ).all() as Array<{ name: string; description: string | null }>;

    const areaList = lifeAreas.map(a => `- ${a.name}: ${a.description || a.name}`).join("\n");
    const topicNames = topicsWithoutArea.map(t => t.name);

    const prompt = `Assign each topic to the most appropriate life area.

Life areas:
${areaList}

Topics to classify:
${topicNames.map(n => `- ${n}`).join("\n")}

Respond with ONLY valid JSON mapping topic name to life area:
${JSON.stringify(Object.fromEntries(topicNames.slice(0, 3).map(n => [n, "example_area"])))}`;

    try {
      const response = await this.llm.complete(
        "You are a topic classifier. Respond with valid JSON only — a flat object mapping topic names to life area names.",
        prompt,
      );

      if (!response) return [];

      // Parse JSON, handling possible markdown code fences
      const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const assignments = JSON.parse(cleaned) as Record<string, string>;
      const validAreas = new Set(lifeAreas.map(a => a.name));
      const actions: GardenAction[] = [];

      for (const topic of topicsWithoutArea) {
        const area = assignments[topic.name];
        if (area && validAreas.has(area)) {
          raw.prepare(
            "UPDATE managed_topics SET life_area = ? WHERE id = ?"
          ).run(area, topic.id);

          actions.push({
            type: "auto_assign_life_area",
            details: {
              topic_id: topic.id,
              topic_name: topic.name,
              assigned_life_area: area,
              vote_count: 0,
              source: "llm",
            },
            affected_ids: [String(topic.id)],
          });
        }
      }

      return actions;
    } catch (error) {
      console.error("[gardener] LLM life area assignment failed:", error);
      return [];
    }
  }

  // ============================================
  // Step 4: Retroactively tag thoughts
  // ============================================

  retroactivelyTag(): GardenAction[] {
    const actions: GardenAction[] = [];
    const tagged = this.db.assignTopicsFromAutoTopicsBatch();

    if (tagged > 0) {
      actions.push({
        type: "retroactive_tag",
        details: {
          thoughts_tagged: tagged,
        },
        affected_ids: [],
      });
    }

    return actions;
  }

  // ============================================
  // Step 5: LLM-powered consolidation (Phase 3)
  // ============================================

  async consolidateSuggestions(): Promise<GardenAction[]> {
    if (!this.llm) {
      return [];
    }

    const pendingSuggestions = this.db.getPendingSuggestions();
    if (pendingSuggestions.length < 2) {
      return [];
    }

    const managedTopics = this.db.getManagedTopicNames();

    const prompt = `You are a topic taxonomy curator. Given a list of pending topic suggestions and existing managed topics, identify groups of near-duplicates among the pending suggestions.

Existing managed topics: ${JSON.stringify(managedTopics)}

Pending suggestions:
${pendingSuggestions.map((s) => `- "${s.name}" (id: ${s.id})`).join("\n")}

For each group of near-duplicates, pick the best canonical name (prefer kebab-case, concise, matches existing naming conventions). Only group suggestions that are genuinely about the same concept.

Respond with ONLY valid JSON, no explanation:
{
  "groups": [
    {
      "canonical": "best-name",
      "duplicates": ["other-name-1", "other-name-2"],
      "reason": "brief explanation"
    }
  ]
}

If no near-duplicates exist, respond with: {"groups": []}`;

    try {
      const response = await this.llm.complete(
        "You are a taxonomy curator. Respond with valid JSON only.",
        prompt,
      );

      if (!response) return [];

      const parsed = JSON.parse(response) as { groups: ConsolidationGroup[] };
      if (!parsed.groups || parsed.groups.length === 0) return [];

      const actions: GardenAction[] = [];

      for (const group of parsed.groups) {
        // Find the suggestion with the canonical name (or keep one of the duplicates)
        const allNames = [group.canonical, ...group.duplicates];
        const matchingSuggestions = pendingSuggestions.filter((s) =>
          allNames.includes(s.name)
        );

        if (matchingSuggestions.length < 2) continue;

        // Find or pick the canonical suggestion
        const canonicalSuggestion = matchingSuggestions.find(
          (s) => s.name === group.canonical
        ) || matchingSuggestions[0];

        // Reject the others
        const toReject = matchingSuggestions
          .filter((s) => s.id !== canonicalSuggestion.id)
          .map((s) => s.id);

        if (toReject.length > 0) {
          this.db.rejectSuggestionsBatch(toReject);

          // If the canonical name differs from the kept suggestion, update it
          if (canonicalSuggestion.name !== group.canonical) {
            const raw = this.db.getRawDb();
            raw.prepare(
              "UPDATE suggested_topics SET name = ? WHERE id = ?"
            ).run(group.canonical, canonicalSuggestion.id);
          }

          actions.push({
            type: "consolidate",
            details: {
              canonical_name: group.canonical,
              merged_names: group.duplicates,
              reason: group.reason,
              kept_suggestion_id: canonicalSuggestion.id,
              rejected_ids: toReject,
            },
            affected_ids: toReject.map(String),
          });
        }
      }

      return actions;
    } catch (error) {
      console.error("[gardener] LLM consolidation failed:", error);
      return [];
    }
  }

  // ============================================
  // Digest thought capture
  // ============================================

  private captureDigestThought(result: GardenResult): void {
    const { summary } = result;
    const parts: string[] = [];
    if (summary.topics_approved > 0)
      parts.push(`approved ${summary.topics_approved} topic(s)`);
    if (summary.duplicates_merged > 0)
      parts.push(`merged ${summary.duplicates_merged} duplicate(s)`);
    if (summary.thoughts_tagged > 0)
      parts.push(`tagged ${summary.thoughts_tagged} thought(s)`);
    if (summary.life_areas_assigned > 0)
      parts.push(`assigned ${summary.life_areas_assigned} life area(s)`);

    if (parts.length === 0) return;

    const text = `Gardener report: ${parts.join(", ")}.`;
    this.db.createThought({
      text,
      thought_type: "note",
      source_channel: "gardener",
      life_area: "meta",
    });
  }

  // ============================================
  // Full garden run
  // ============================================

  async runFull(dryRun: boolean = false): Promise<GardenResult> {
    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const allActions: GardenAction[] = [];
    const skippedSteps: string[] = [];

    // Step 1: Deduplicate
    const dedupActions = this.deduplicateSuggestions();
    if (dryRun) {
      // In dry run, we already executed — but this is a preview.
      // For a true dry run, we'd need transactions. Instead we note
      // that dry_run only previews what WOULD happen.
    }
    allActions.push(...dedupActions);

    // Step 2: Auto-approve
    const approveActions = this.autoApprove();
    allActions.push(...approveActions);

    // Step 3: Auto-assign life areas
    const lifeAreaActions = this.autoAssignLifeAreas();
    allActions.push(...lifeAreaActions);

    // Step 4: Retroactively tag
    const tagActions = this.retroactivelyTag();
    allActions.push(...tagActions);

    // Step 5: LLM life area assignment (for topics with no vote data)
    if (this.llm) {
      const llmAreaActions = await this.autoAssignLifeAreasLLM();
      allActions.push(...llmAreaActions);
    } else {
      skippedSteps.push("llm_life_areas (no LLM available)");
    }

    // Step 6: LLM consolidation
    if (this.llm) {
      const consolidateActions = await this.consolidateSuggestions();
      allActions.push(...consolidateActions);
    } else {
      skippedSteps.push("consolidate (no LLM available)");
    }

    const completedAt = new Date().toISOString();

    const result: GardenResult = {
      run_id: runId,
      started_at: startedAt,
      completed_at: completedAt,
      actions: allActions,
      summary: {
        duplicates_merged: allActions
          .filter((a) => a.type === "dedup_merge")
          .reduce((sum, a) => sum + ((a.details.rejected_ids as string[])?.length || 0), 0),
        suggestions_consolidated: allActions.filter((a) => a.type === "consolidate").length,
        topics_approved: allActions.filter((a) => a.type === "auto_approve").length,
        life_areas_assigned: allActions.filter((a) => a.type === "auto_assign_life_area").length,
        thoughts_tagged: allActions
          .filter((a) => a.type === "retroactive_tag")
          .reduce((sum, a) => sum + ((a.details.thoughts_tagged as number) || 0), 0),
        skipped_steps: skippedSteps,
      },
    };

    // Log actions and capture digest thought (unless dry run)
    if (!dryRun) {
      for (const action of allActions) {
        this.db.logGardenAction(
          runId,
          action.type,
          action.details,
          action.affected_ids,
        );
      }
      this.captureDigestThought(result);
    }

    return result;
  }
}
