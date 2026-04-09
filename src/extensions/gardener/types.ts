// Gardener extension types

export interface GardenAction {
  type:
    | "dedup_merge"
    | "consolidate"
    | "auto_approve"
    | "auto_assign_topic"
    | "auto_assign_life_area"
    | "retroactive_tag"
    | "thought_dedup"
    | "age_archive"
    | "age_flag";
  details: Record<string, unknown>;
  affected_ids: string[];
}

export interface GardenResult {
  run_id: string;
  started_at: string;
  completed_at: string;
  actions: GardenAction[];
  summary: {
    duplicates_merged: number;
    suggestions_consolidated: number;
    topics_approved: number;
    life_areas_assigned: number;
    thoughts_tagged: number;
    thoughts_deduped: number;
    thoughts_archived: number;
    thoughts_flagged: number;
    skipped_steps: string[];
  };
}

export interface GardenLogEntry {
  id: number;
  run_id: string;
  action_type: string;
  details: Record<string, unknown>;
  affected_ids: string[];
  created_at: string;
}
