/**
 * Sandbox Tool Executor Service
 *
 * Story 18-3: Agent Sandbox Testing
 *
 * Executes tool calls in sandbox mode, returning mock/safe results
 * without performing real operations.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  SandboxToolCallStatus,
} from '../../database/entities/agent-sandbox-tool-call.entity';
import { AgentDefinitionSpec } from '../../database/entities/agent-definition.entity';

export interface SandboxToolResult {
  success: boolean;
  status: SandboxToolCallStatus;
  output: Record<string, unknown> | null;
  denialReason?: string;
  errorMessage?: string;
  durationMs: number;
}

export interface ToolPermissions {
  allowed?: string[];
  denied?: string[];
}

// Safe commands allowed in sandbox execution
const SAFE_COMMANDS = [
  'ls', 'cat', 'head', 'tail', 'grep', 'wc', 'find', 'sort', 'uniq',
  'echo', 'pwd', 'whoami', 'date', 'env', 'which', 'file', 'stat',
];

@Injectable()
export class SandboxToolExecutorService {
  private readonly logger = new Logger(SandboxToolExecutorService.name);

  /**
   * Execute a tool call in sandbox mode.
   * Does NOT perform real operations - returns mock/safe data.
   */
  async executeTool(
    sessionId: string,
    toolCategory: string,
    toolName: string,
    input: Record<string, unknown>,
    permissions: ToolPermissions,
    fileSystem?: Map<string, string>,
  ): Promise<SandboxToolResult> {
    const startTime = Date.now();

    // 1. Check permission
    const permissionResult = this.checkPermission(toolCategory, toolName, permissions);
    if (!permissionResult.allowed) {
      return {
        success: false,
        status: SandboxToolCallStatus.DENIED,
        denialReason: permissionResult.reason,
        output: null,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Execute sandboxed version
    try {
      const result = await this.executeSandboxedTool(
        toolCategory,
        toolName,
        input,
        sessionId,
        fileSystem,
      );
      result.durationMs = Date.now() - startTime;
      return result;
    } catch (error) {
      return {
        success: false,
        status: SandboxToolCallStatus.ERROR,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        output: null,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Check if tool execution is permitted based on agent permissions.
   */
  private checkPermission(
    toolCategory: string,
    toolName: string,
    permissions: ToolPermissions,
  ): { allowed: boolean; reason?: string } {
    const fullToolName = `${toolCategory}:${toolName}`;

    // Check if explicitly denied
    if (permissions.denied?.length) {
      // Check for category wildcard denial
      if (permissions.denied.includes(`${toolCategory}:*`)) {
        return { allowed: false, reason: `Category '${toolCategory}' is denied` };
      }
      // Check for specific tool denial
      if (permissions.denied.includes(fullToolName)) {
        return { allowed: false, reason: `Tool '${fullToolName}' is denied` };
      }
    }

    // Check if explicitly allowed
    if (permissions.allowed?.length) {
      // Check for category wildcard allowance
      if (permissions.allowed.includes(`${toolCategory}:*`)) {
        return { allowed: true };
      }
      // Check for specific tool allowance
      if (permissions.allowed.includes(fullToolName)) {
        return { allowed: true };
      }
      // If allowed list exists but tool not in it, deny by default
      return { allowed: false, reason: `Tool '${fullToolName}' is not in allowed list` };
    }

    // No restrictions - allow by default in sandbox
    return { allowed: true };
  }

  /**
   * Map tool calls to sandbox implementations.
   */
  private async executeSandboxedTool(
    category: string,
    tool: string,
    input: Record<string, unknown>,
    sessionId: string,
    fileSystem?: Map<string, string>,
  ): Promise<SandboxToolResult> {
    const fullTool = `${category}:${tool}`;

    switch (fullTool) {
      case 'github:read_files':
        return this.sandboxReadFiles(input, sessionId, fileSystem);

      case 'github:write_files':
        return this.sandboxWriteFiles(input, sessionId, fileSystem);

      case 'github:create_pr':
        return this.sandboxCreatePR(input, sessionId);

      case 'github:list_files':
        return this.sandboxListFiles(input, sessionId, fileSystem);

      case 'deployment:deploy_staging':
        return this.sandboxDeploy(input, 'staging', sessionId);

      case 'deployment:deploy_production':
        return this.sandboxDeploy(input, 'production', sessionId);

      case 'deployment:status':
        return this.sandboxDeploymentStatus(input, sessionId);

      case 'database:read_query':
        return this.sandboxDatabaseQuery(input, sessionId);

      case 'database:write_query':
        return this.sandboxDatabaseWrite(input, sessionId);

      case 'filesystem:read':
        return this.sandboxFileRead(input, sessionId, fileSystem);

      case 'filesystem:write':
        return this.sandboxFileWrite(input, sessionId, fileSystem);

      case 'filesystem:delete':
        return this.sandboxFileDelete(input, sessionId, fileSystem);

      case 'filesystem:list':
        return this.sandboxFileList(input, sessionId, fileSystem);

      case 'filesystem:execute':
        return this.sandboxExecute(input, sessionId);

      case 'web:fetch':
        return this.sandboxWebFetch(input, sessionId);

      case 'web:request':
        return this.sandboxWebRequest(input, sessionId);

      default:
        return this.sandboxGenericTool(category, tool, input, sessionId);
    }
  }

  // ---- Sandbox Tool Implementations ----

  /**
   * GitHub: Read files - Returns sample project files from in-memory store
   */
  private sandboxReadFiles(
    input: Record<string, unknown>,
    sessionId: string,
    fileSystem?: Map<string, string>,
  ): SandboxToolResult {
    const paths = input.paths as string[] || [];
    const files: Record<string, string> = {};

    if (fileSystem) {
      for (const path of paths) {
        const content = fileSystem.get(path);
        if (content !== undefined) {
          files[path] = content;
        }
      }
    }

    // Return mock files if not found in file system
    if (Object.keys(files).length === 0) {
      return {
        success: true,
        status: SandboxToolCallStatus.SUCCESS,
        output: {
          message: 'Files retrieved from sandbox repository',
          files: {
            'README.md': '# Sample Project\n\nThis is a sandbox project for testing.',
            'package.json': JSON.stringify({ name: 'sandbox-project', version: '1.0.0' }),
          },
          repository: 'sandbox-org/sandbox-repo',
          branch: 'main',
        },
      };
    }

    return {
      success: true,
      status: SandboxToolCallStatus.SUCCESS,
      output: {
        message: 'Files retrieved from sandbox',
        files,
        sessionId,
      },
    };
  }

  /**
   * GitHub: Write files - Writes to in-memory file system, not real repo
   */
  private sandboxWriteFiles(
    input: Record<string, unknown>,
    sessionId: string,
    fileSystem?: Map<string, string>,
  ): SandboxToolResult {
    const files = input.files as Record<string, string> || {};
    const commitMessage = input.message as string || 'Sandbox commit';

    if (fileSystem) {
      for (const [path, content] of Object.entries(files)) {
        fileSystem.set(path, content);
      }
    }

    return {
      success: true,
      status: SandboxToolCallStatus.SUCCESS,
      output: {
        message: 'Files written to sandbox (not persisted to real repository)',
        filesWritten: Object.keys(files),
        commitSha: `sandbox-${sessionId.substring(0, 8)}`,
        commitMessage,
        branch: 'sandbox-branch',
        note: 'This is a sandbox operation - no actual repository changes were made',
      },
    };
  }

  /**
   * GitHub: Create PR - Returns mock PR with fake URL
   */
  private sandboxCreatePR(
    input: Record<string, unknown>,
    sessionId: string,
  ): SandboxToolResult {
    const title = input.title as string || 'Sandbox PR';
    const body = input.body as string || '';

    return {
      success: true,
      status: SandboxToolCallStatus.SUCCESS,
      output: {
        message: 'Pull request created in sandbox',
        pullRequest: {
          id: `sandbox-pr-${sessionId.substring(0, 8)}`,
          number: Math.floor(Math.random() * 1000) + 1,
          title,
          body,
          state: 'open',
          html_url: `https://github.com/sandbox-org/sandbox-repo/pull/${Math.floor(Math.random() * 1000) + 1}`,
          created_at: new Date().toISOString(),
        },
        note: 'This is a sandbox operation - no actual PR was created',
      },
    };
  }

  /**
   * GitHub: List files - Returns list of files in sandbox
   */
  private sandboxListFiles(
    input: Record<string, unknown>,
    sessionId: string,
    fileSystem?: Map<string, string>,
  ): SandboxToolResult {
    const path = input.path as string || '/';

    let files: string[];
    if (fileSystem) {
      files = Array.from(fileSystem.keys()).filter((f) =>
        path === '/' || f.startsWith(path as string),
      );
    } else {
      files = [
        'README.md',
        'package.json',
        'tsconfig.json',
        'src/index.ts',
        'src/utils.ts',
      ];
    }

    return {
      success: true,
      status: SandboxToolCallStatus.SUCCESS,
      output: {
        path,
        files: files.map((f) => ({
          path: f,
          type: f.includes('.') ? 'file' : 'directory',
          size: Math.floor(Math.random() * 10000),
        })),
        sessionId,
      },
    };
  }

  /**
   * Deployment: Deploy - Returns mock deployment status, no real deployment
   */
  private sandboxDeploy(
    input: Record<string, unknown>,
    environment: string,
    sessionId: string,
  ): SandboxToolResult {
    return {
      success: true,
      status: SandboxToolCallStatus.SUCCESS,
      output: {
        message: `Deployment to ${environment} initiated in sandbox`,
        deployment: {
          id: `sandbox-deploy-${sessionId.substring(0, 8)}`,
          status: 'building',
          environment,
          url: `https://${environment}.sandbox.example.com`,
          buildLog: [
            'Installing dependencies...',
            'Building application...',
            'Running tests...',
            'Deploying...',
          ],
          startedAt: new Date().toISOString(),
          note: 'This is a sandbox operation - no actual deployment was made',
        },
      },
    };
  }

  /**
   * Deployment: Status - Returns mock status
   */
  private sandboxDeploymentStatus(
    input: Record<string, unknown>,
    sessionId: string,
  ): SandboxToolResult {
    const deploymentId = input.deploymentId as string || `sandbox-deploy-${sessionId.substring(0, 8)}`;

    return {
      success: true,
      status: SandboxToolCallStatus.SUCCESS,
      output: {
        deploymentId,
        status: 'success',
        url: 'https://sandbox.example.com',
        duration: Math.floor(Math.random() * 120) + 30,
        logs: [
          { timestamp: new Date().toISOString(), message: 'Build started' },
          { timestamp: new Date().toISOString(), message: 'Build completed' },
          { timestamp: new Date().toISOString(), message: 'Deployment successful' },
        ],
      },
    };
  }

  /**
   * Database: Read query - Returns mock query results from sample data
   */
  private sandboxDatabaseQuery(
    input: Record<string, unknown>,
    sessionId: string,
  ): SandboxToolResult {
    const query = input.query as string || 'SELECT * FROM users';

    // Return mock data based on query patterns
    let mockData: Record<string, unknown>[];
    if (query.toLowerCase().includes('users')) {
      mockData = [
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
        { id: 3, name: 'Bob Wilson', email: 'bob@example.com' },
      ];
    } else if (query.toLowerCase().includes('orders')) {
      mockData = [
        { id: 1, user_id: 1, total: 99.99, status: 'completed' },
        { id: 2, user_id: 2, total: 149.99, status: 'pending' },
      ];
    } else {
      mockData = [
        { id: 1, data: 'sample row 1' },
        { id: 2, data: 'sample row 2' },
      ];
    }

    return {
      success: true,
      status: SandboxToolCallStatus.SUCCESS,
      output: {
        query,
        rows: mockData,
        rowCount: mockData.length,
        executionTimeMs: Math.floor(Math.random() * 100) + 10,
        note: 'This is a sandbox operation - no actual database was queried',
      },
    };
  }

  /**
   * Database: Write query - Returns mock write result
   */
  private sandboxDatabaseWrite(
    input: Record<string, unknown>,
    sessionId: string,
  ): SandboxToolResult {
    const query = input.query as string || 'INSERT INTO users VALUES (...)';

    return {
      success: true,
      status: SandboxToolCallStatus.SUCCESS,
      output: {
        query,
        affectedRows: 1,
        insertId: Math.floor(Math.random() * 1000) + 1,
        executionTimeMs: Math.floor(Math.random() * 50) + 5,
        note: 'This is a sandbox operation - no actual database was modified',
      },
    };
  }

  /**
   * Filesystem: Read - Reads from sandbox file system
   */
  private sandboxFileRead(
    input: Record<string, unknown>,
    sessionId: string,
    fileSystem?: Map<string, string>,
  ): SandboxToolResult {
    const path = input.path as string;

    if (!path) {
      return {
        success: false,
        status: SandboxToolCallStatus.ERROR,
        errorMessage: 'Path is required',
        output: null,
      };
    }

    if (fileSystem) {
      const content = fileSystem.get(path);
      if (content !== undefined) {
        return {
          success: true,
          status: SandboxToolCallStatus.SUCCESS,
          output: {
            path,
            content,
            size: content.length,
          },
        };
      }
    }

    return {
      success: false,
      status: SandboxToolCallStatus.ERROR,
      errorMessage: `File not found: ${path}`,
      output: null,
    };
  }

  /**
   * Filesystem: Write - Writes to sandbox file system
   */
  private sandboxFileWrite(
    input: Record<string, unknown>,
    sessionId: string,
    fileSystem?: Map<string, string>,
  ): SandboxToolResult {
    const path = input.path as string;
    const content = input.content as string;

    if (!path || content === undefined) {
      return {
        success: false,
        status: SandboxToolCallStatus.ERROR,
        errorMessage: 'Path and content are required',
        output: null,
      };
    }

    if (fileSystem) {
      fileSystem.set(path, content);
    }

    return {
      success: true,
      status: SandboxToolCallStatus.SUCCESS,
      output: {
        path,
        bytesWritten: content.length,
        message: 'File written to sandbox file system',
      },
    };
  }

  /**
   * Filesystem: Delete - Deletes from sandbox file system
   */
  private sandboxFileDelete(
    input: Record<string, unknown>,
    sessionId: string,
    fileSystem?: Map<string, string>,
  ): SandboxToolResult {
    const path = input.path as string;

    if (!path) {
      return {
        success: false,
        status: SandboxToolCallStatus.ERROR,
        errorMessage: 'Path is required',
        output: null,
      };
    }

    if (fileSystem) {
      const existed = fileSystem.delete(path);
      return {
        success: true,
        status: SandboxToolCallStatus.SUCCESS,
        output: {
          path,
          deleted: existed,
          message: existed ? 'File deleted' : 'File did not exist',
        },
      };
    }

    return {
      success: false,
      status: SandboxToolCallStatus.ERROR,
      errorMessage: 'No sandbox file system available',
      output: null,
    };
  }

  /**
   * Filesystem: List - Lists files in sandbox
   */
  private sandboxFileList(
    input: Record<string, unknown>,
    sessionId: string,
    fileSystem?: Map<string, string>,
  ): SandboxToolResult {
    const path = input.path as string || '/';

    if (fileSystem) {
      const files = Array.from(fileSystem.keys())
        .filter((f) => path === '/' || f.startsWith(path));
      return {
        success: true,
        status: SandboxToolCallStatus.SUCCESS,
        output: {
          path,
          files: files.map((f) => ({
            name: f.split('/').pop(),
            path: f,
            type: 'file',
          })),
        },
      };
    }

    return {
      success: true,
      status: SandboxToolCallStatus.SUCCESS,
      output: {
        path,
        files: [],
        message: 'Empty sandbox file system',
      },
    };
  }

  /**
   * Filesystem: Execute - Only allows safe commands
   */
  private sandboxExecute(
    input: Record<string, unknown>,
    sessionId: string,
  ): SandboxToolResult {
    const command = input.command as string;
    const args = input.args as string[] || [];

    if (!command) {
      return {
        success: false,
        status: SandboxToolCallStatus.ERROR,
        errorMessage: 'Command is required',
        output: null,
      };
    }

    // Only allow safe commands
    if (!SAFE_COMMANDS.includes(command)) {
      return {
        success: false,
        status: SandboxToolCallStatus.DENIED,
        denialReason: `Command '${command}' is not allowed in sandbox. Allowed commands: ${SAFE_COMMANDS.join(', ')}`,
        output: null,
      };
    }

    // Return mock output for safe commands
    const mockOutput = this.generateMockCommandOutput(command, args);

    return {
      success: true,
      status: SandboxToolCallStatus.SUCCESS,
      output: {
        command: `${command} ${args.join(' ')}`.trim(),
        stdout: mockOutput,
        stderr: '',
        exitCode: 0,
        note: 'This is a sandbox operation - command was simulated',
      },
    };
  }

  /**
   * Web: Fetch - Returns mock web response
   */
  private sandboxWebFetch(
    input: Record<string, unknown>,
    sessionId: string,
  ): SandboxToolResult {
    const url = input.url as string;

    if (!url) {
      return {
        success: false,
        status: SandboxToolCallStatus.ERROR,
        errorMessage: 'URL is required',
        output: null,
      };
    }

    return {
      success: true,
      status: SandboxToolCallStatus.SUCCESS,
      output: {
        url,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        body: `<!DOCTYPE html><html><body><h1>Sandbox Mock Response</h1><p>URL: ${url}</p></body></html>`,
        note: 'This is a sandbox operation - no actual HTTP request was made',
      },
    };
  }

  /**
   * Web: Request - Returns mock API response
   */
  private sandboxWebRequest(
    input: Record<string, unknown>,
    sessionId: string,
  ): SandboxToolResult {
    const url = input.url as string;
    const method = input.method as string || 'GET';

    if (!url) {
      return {
        success: false,
        status: SandboxToolCallStatus.ERROR,
        errorMessage: 'URL is required',
        output: null,
      };
    }

    return {
      success: true,
      status: SandboxToolCallStatus.SUCCESS,
      output: {
        url,
        method,
        status: 200,
        statusText: 'OK',
        data: { message: 'Sandbox mock API response', sessionId },
        note: 'This is a sandbox operation - no actual HTTP request was made',
      },
    };
  }

  /**
   * Generic tool handler for unknown tools
   */
  private sandboxGenericTool(
    category: string,
    tool: string,
    input: Record<string, unknown>,
    sessionId: string,
  ): SandboxToolResult {
    this.logger.debug(`Using generic sandbox handler for ${category}:${tool}`);

    return {
      success: true,
      status: SandboxToolCallStatus.SUCCESS,
      output: {
        tool: `${category}:${tool}`,
        input,
        result: 'Sandbox mock response',
        sessionId,
        note: 'This tool executed in sandbox mode with mock data',
      },
    };
  }

  /**
   * Generate mock output for safe commands
   */
  private generateMockCommandOutput(command: string, args: string[]): string {
    switch (command) {
      case 'ls':
        return 'README.md\npackage.json\nsrc/\nlib/\n';
      case 'pwd':
        return '/sandbox/project\n';
      case 'whoami':
        return 'sandbox-user\n';
      case 'date':
        return new Date().toISOString() + '\n';
      case 'cat':
        return args[0] ? `Contents of ${args[0]}\n` : '';
      case 'grep':
        return 'line 1: sample match\nline 2: another match\n';
      case 'wc':
        return '  10  50 300\n';
      case 'find':
        return './src\n./src/index.ts\n./src/utils.ts\n';
      case 'echo':
        return args.join(' ') + '\n';
      default:
        return `Mock output for ${command}\n`;
    }
  }
}
