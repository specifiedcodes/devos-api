/**
 * Context Generation Interfaces
 * Story 12.4: Three-Tier Context Recovery Enhancement
 *
 * Defines types for the project-level context file generation system:
 * - Tier 1: .devoscontext (JSON, minimal state machine)
 * - Tier 2: DEVOS.md (Markdown, full instructions)
 * - Tier 3: project-state.yaml (YAML, complete history)
 */

// ── Tier 1: .devoscontext ──────────────────────────────────────────────────

/**
 * Active agent information included in .devoscontext.
 */
export interface ActiveAgent {
  type: string; // 'dev' | 'qa' | 'planner' | 'devops'
  story: string; // Story ID (e.g., "12.4")
  status: string; // 'working' | 'reviewing' | 'idle'
}

/**
 * Minimal state machine context file (.devoscontext).
 * JSON format, target size <2KB.
 * Generated after every story status change.
 */
export interface DevOSContext {
  version: string; // "1.0"
  project_id: string; // UUID
  workspace_id: string; // UUID
  phase: string; // 'planning' | 'implementation' | 'qa' | 'deployment' | 'done'
  current_sprint: number;
  active_agents: ActiveAgent[];
  next_actions: string[];
  blockers: string[];
  last_updated: string; // ISO 8601
}

// ── Tier 3: project-state.yaml ─────────────────────────────────────────────

/**
 * A single story completion entry in project-state.yaml.
 * Appended after each story completion event.
 */
export interface ProjectStateEntry {
  storyId: string;
  title: string;
  completedAt: string; // ISO 8601
  agentType: string;
  decisions: string[];
  issues: string[];
  filesChanged: number;
  testsPassed: number;
  memoryEpisodeIds: string[];
}

/**
 * Top-level structure of project-state.yaml.
 */
export interface ProjectState {
  version: string;
  project_id: string;
  workspace_id: string;
  generated_at: string;
  stories: ProjectStateEntry[];
}

// ── Context Refresh ────────────────────────────────────────────────────────

/**
 * Result returned after a manual or automatic context refresh.
 */
export interface ContextRefreshResult {
  tier1Updated: boolean;
  tier2Updated: boolean;
  tier3Updated: boolean;
  refreshDurationMs: number;
}

// ── Generation Triggers ────────────────────────────────────────────────────

/**
 * Types of triggers that cause context file generation.
 */
export type ContextGenerationTrigger =
  | 'story_status_change'
  | 'story_completion'
  | 'epic_completion'
  | 'sprint_end'
  | 'manual';

// ── Project Metadata ───────────────────────────────────────────────────────

/**
 * Project metadata used when generating DEVOS.md (Tier 2).
 * Provided by callers (controller, trigger service).
 */
export interface ProjectMetadata {
  name: string;
  description: string;
  techStack: string;
  conventions: string;
  architectureSummary: string;
  currentEpic?: string;
  sprintNumber?: number;
  activeStories?: string[];
  completedCount?: number;
  totalCount?: number;
}
