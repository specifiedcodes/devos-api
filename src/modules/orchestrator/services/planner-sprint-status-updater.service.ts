/**
 * PlannerSprintStatusUpdaterService
 * Story 11.6: Planner Agent CLI Integration
 *
 * Manages sprint-status.yaml updates for the Planner Agent.
 * Adds new stories, updates epic statuses, and validates YAML output.
 * Operations are idempotent - existing entries are preserved and duplicates skipped.
 *
 * Uses simple line-based YAML parsing for the sprint-status.yaml format,
 * which is a flat key-value structure under development_status.
 */
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  PlannerStoryEntry,
  SprintStatusUpdateResult,
  ParsedSprintStatus,
} from '../interfaces/planner-agent-execution.interfaces';

/** Standard header for new sprint-status.yaml files */
const SPRINT_STATUS_HEADER = `# generated: {{date}}
# project: devos
# project_key: devos
# tracking_system: file-system

`;

@Injectable()
export class PlannerSprintStatusUpdaterService {
  private readonly logger = new Logger(PlannerSprintStatusUpdaterService.name);

  /**
   * Update sprint-status.yaml with new stories from planning output.
   * Adds stories to the correct epic section with 'backlog' or 'ready-for-dev' status.
   * Skips stories that already exist to ensure idempotency.
   *
   * @param params - Workspace path, epic ID, and stories to add
   * @returns Update result with counts and status
   */
  async updateSprintStatus(params: {
    workspacePath: string;
    epicId: string;
    stories: PlannerStoryEntry[];
  }): Promise<SprintStatusUpdateResult> {
    const filePath = path.join(
      params.workspacePath,
      '_bmad-output',
      'implementation-artifacts',
      'sprint-status.yaml',
    );

    try {
      // Parse existing sprint status
      const existing = await this.parseSprintStatus(params.workspacePath);

      // Filter out stories that already exist
      const newStories = params.stories.filter(
        (story) => !existing.stories.has(story.storyId),
      );

      const skipped = params.stories.length - newStories.length;

      if (newStories.length === 0) {
        this.logger.log(
          `All ${params.stories.length} stories already exist in sprint-status.yaml, skipping update`,
        );
        return {
          success: true,
          storiesAdded: 0,
          storiesSkipped: skipped,
          updatedFilePath: filePath,
          error: null,
        };
      }

      // Read existing file content or create new
      let content: string;
      if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, 'utf-8');
      } else {
        // Create the file with standard header
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        content = SPRINT_STATUS_HEADER.replace(
          '{{date}}',
          new Date().toISOString().split('T')[0],
        );
        content += 'development_status:\n';
      }

      // Update epic status to in-progress if it's currently backlog
      const epicKey = params.epicId.startsWith('epic-')
        ? params.epicId
        : `epic-${params.epicId}`;
      const epicStatus = existing.epics.get(epicKey);
      if (epicStatus === 'backlog' || !epicStatus) {
        // Add or update epic status line
        if (content.includes(`${epicKey}:`)) {
          content = content.replace(
            new RegExp(`(${epicKey}:\\s*)\\S+`),
            `$1in-progress`,
          );
        } else {
          // Add epic line before stories
          const epicComment = `\n  # Epic ${params.epicId}\n  ${epicKey}: in-progress\n`;
          if (content.includes('development_status:')) {
            content = content.replace(
              'development_status:\n',
              `development_status:\n${epicComment}`,
            );
          }
        }
      }

      // Insert new stories under the correct epic section (or at end if not found)
      const storyLines = newStories
        .map((story) => {
          const comment = story.title ? `  # ${story.title}` : '';
          return `  ${story.storyId}: ${story.status}${comment}`;
        })
        .join('\n');

      // Try to insert stories after the epic entry line to keep them grouped
      const epicLinePattern = new RegExp(
        `(${epicKey}:\\s*[\\w-]+[^\\n]*)`,
      );
      if (epicLinePattern.test(content)) {
        // Find the last story line under this epic section to insert after it
        const lines = content.split('\n');
        let insertIndex = -1;
        let foundEpic = false;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].match(new RegExp(`^\\s+${epicKey}:`))) {
            foundEpic = true;
            insertIndex = i;
          } else if (foundEpic && lines[i].match(/^\s+\d+-\d+/)) {
            // Story line under this epic
            insertIndex = i;
          } else if (foundEpic && lines[i].match(/^\s+#\s/) && lines[i - 1]?.match(/^\s+\d+-\d+/)) {
            // Comment on same line is already captured, skip standalone comments that follow stories
            continue;
          } else if (foundEpic && (lines[i].match(/^\s+epic-/) || lines[i].trim() === '')) {
            // Hit next epic or blank line - stop here
            break;
          }
        }

        if (insertIndex >= 0) {
          lines.splice(insertIndex + 1, 0, storyLines);
          content = lines.join('\n');
        } else {
          // Fallback: append at end
          if (!content.endsWith('\n')) {
            content += '\n';
          }
          content += storyLines + '\n';
        }
      } else {
        // Epic section not found - append at end
        if (!content.endsWith('\n')) {
          content += '\n';
        }
        content += storyLines + '\n';
      }

      // Write updated content
      fs.writeFileSync(filePath, content, 'utf-8');

      // Validate the output
      const isValid = await this.validateSprintStatus(params.workspacePath);
      if (!isValid) {
        this.logger.warn(
          'Sprint-status.yaml validation failed after update, but changes were written',
        );
      }

      this.logger.log(
        `Updated sprint-status.yaml: ${newStories.length} stories added, ${skipped} skipped`,
      );

      return {
        success: true,
        storiesAdded: newStories.length,
        storiesSkipped: skipped,
        updatedFilePath: filePath,
        error: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to update sprint-status.yaml: ${errorMessage}`,
      );

      return {
        success: false,
        storiesAdded: 0,
        storiesSkipped: 0,
        updatedFilePath: filePath,
        error: errorMessage,
      };
    }
  }

  /**
   * Parse existing sprint-status.yaml to get current entries.
   * Uses line-based parsing for the simple key-value YAML format.
   *
   * @param workspacePath - Local workspace directory
   * @returns Parsed sprint status with epic and story maps
   */
  async parseSprintStatus(workspacePath: string): Promise<ParsedSprintStatus> {
    const filePath = path.join(
      workspacePath,
      '_bmad-output',
      'implementation-artifacts',
      'sprint-status.yaml',
    );

    const epics = new Map<string, string>();
    const stories = new Map<string, { status: string; comment: string }>();

    try {
      if (!fs.existsSync(filePath)) {
        return { epics, stories };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        // Match epic entries: "  epic-N: status"
        const epicMatch = line.match(
          /^\s+(epic-\d+[\w-]*):\s*(\S+)/,
        );
        if (epicMatch) {
          epics.set(epicMatch[1], epicMatch[2]);
          continue;
        }

        // Match story entries: "  N-N[-slug]: status [# comment]"
        // Use a specific status pattern (word chars and hyphens) to avoid greedily
        // matching into the comment delimiter when there's no space before #
        const storyMatch = line.match(
          /^\s+(\d+-\d+[\w-]*):\s*([\w-]+)\s*(?:#\s*(.*))?$/,
        );
        if (storyMatch) {
          const storyId = storyMatch[1];
          const status = storyMatch[2];
          const comment = storyMatch[3] || '';
          stories.set(storyId, { status, comment });
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to parse sprint-status.yaml: ${errorMessage}`,
      );
    }

    return { epics, stories };
  }

  /**
   * Validate the sprint-status.yaml file is syntactically correct.
   * Checks that the file has a development_status section and valid key-value pairs.
   *
   * @param workspacePath - Local workspace directory
   * @returns true if valid, false otherwise
   */
  async validateSprintStatus(workspacePath: string): Promise<boolean> {
    const filePath = path.join(
      workspacePath,
      '_bmad-output',
      'implementation-artifacts',
      'sprint-status.yaml',
    );

    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      // Basic validation: must have key-value pairs
      if (!content.includes(':')) {
        return false;
      }

      // Must have development_status section
      if (!content.includes('development_status')) {
        return false;
      }

      // Check for obvious YAML syntax errors
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (trimmed.startsWith('#') || trimmed === '') continue;
        // Non-comment, non-empty lines must have a colon (key-value format)
        if (trimmed.length > 0 && !trimmed.includes(':')) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }
}
