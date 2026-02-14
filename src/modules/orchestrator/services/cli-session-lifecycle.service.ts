/**
 * CLISessionLifecycleService
 * Story 11.2: Claude Code CLI Container Setup
 *
 * Orchestrates the full lifecycle of a CLI session:
 * workspace setup -> config build -> CLI spawn -> monitoring -> cleanup
 *
 * This is the primary entry point called by the pipeline state machine
 * when transitioning into IMPLEMENTING, QA, or DEPLOYING phases.
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { spawn, ChildProcess } from 'child_process';
import { WorkspaceManagerService } from './workspace-manager.service';
import { CLISessionConfigService } from './cli-session-config.service';
import { GitConfigService } from './git-config.service';
import {
  SessionStatus,
  CLISessionSpawnParams,
  CLISessionSpawnResult,
  CLISessionStatusResult,
  CLISessionEvent,
  TrackedSession,
} from '../interfaces/cli-session-config.interfaces';

@Injectable()
export class CLISessionLifecycleService {
  private readonly logger = new Logger(CLISessionLifecycleService.name);

  /** Active sessions tracked by sessionId */
  private readonly activeSessions = new Map<string, TrackedSession>();

  constructor(
    private readonly workspaceManager: WorkspaceManagerService,
    private readonly sessionConfigService: CLISessionConfigService,
    private readonly gitConfigService: GitConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Spawn a new CLI session for a pipeline phase.
   *
   * 1. Prepare workspace (clone/pull repo)
   * 2. Configure Git author
   * 3. Build session config (decrypt BYOK key)
   * 4. Validate config
   * 5. Spawn CLI process with ANTHROPIC_API_KEY in env
   * 6. Emit cli:session:started event
   * 7. Return session ID and PID
   */
  async spawnSession(
    params: CLISessionSpawnParams,
  ): Promise<CLISessionSpawnResult> {
    // 0. Enforce concurrent session limit
    const defaults = await this.sessionConfigService.getDefaults(params.workspaceId);
    const currentActiveCount = this.getActiveSessionCount();
    if (currentActiveCount >= defaults.maxConcurrentSessions) {
      throw new Error(
        `Maximum concurrent session limit reached (${defaults.maxConcurrentSessions}). ` +
        `Currently ${currentActiveCount} active sessions. ` +
        `Terminate existing sessions before spawning new ones.`,
      );
    }

    const sessionId = uuidv4();

    this.logger.log(
      `Spawning CLI session ${sessionId} for agent ${params.agentId} (${params.agentType})`,
    );

    // 1. Prepare workspace
    const workspacePath = await this.workspaceManager.prepareWorkspace(
      params.workspaceId,
      params.projectId,
      params.gitRepoUrl,
      params.gitToken,
    );

    // 2. Configure Git author
    await this.gitConfigService.configureGitAuthor(workspacePath);

    // 3. Build session config (decrypts BYOK key)
    const config = await this.sessionConfigService.buildConfig(
      params.workspaceId,
      params.projectId,
      params.task,
    );

    // 4. Validate config
    const validation = this.sessionConfigService.validateConfig(config);
    if (!validation.valid) {
      throw new Error(
        `Invalid CLI session config: ${validation.errors.join(', ')}`,
      );
    }

    // 5. Spawn the CLI process
    const childProcess = this.spawnCLIProcess(config, workspacePath);
    const pid = childProcess.pid || 0;

    // Track the session
    const trackedSession: TrackedSession = {
      sessionId,
      pid,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      agentId: params.agentId,
      agentType: params.agentType,
      status: SessionStatus.RUNNING,
      startedAt: new Date(),
      outputLineCount: 0,
      process: childProcess,
    };

    this.activeSessions.set(sessionId, trackedSession);

    // Set up process event handlers with the configured timeout
    this.setupProcessHandlers(sessionId, childProcess, config.timeout);

    // 6. Emit started event
    this.emitSessionEvent({
      type: 'cli:session:started',
      sessionId,
      agentId: params.agentId,
      agentType: params.agentType,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      timestamp: new Date(),
      metadata: {
        pid,
        task: params.task,
        storyId: params.storyId,
        model: config.model,
      },
    });

    this.logger.log(
      `CLI session ${sessionId} spawned with PID ${pid}`,
    );

    // 7. Return result
    return { sessionId, pid };
  }

  /**
   * Get the status of a running session.
   */
  async getSessionStatus(
    sessionId: string,
  ): Promise<CLISessionStatusResult | null> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return null;
    }

    const durationMs = Date.now() - session.startedAt.getTime();

    return {
      status: session.status,
      pid: session.status === SessionStatus.RUNNING ? session.pid : null,
      outputLineCount: session.outputLineCount,
      durationMs,
    };
  }

  /**
   * Terminate a session and clean up workspace.
   */
  async terminateSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      this.logger.warn(`Session ${sessionId} not found for termination`);
      return;
    }

    this.logger.log(`Terminating CLI session ${sessionId}`);

    // Kill the process
    try {
      if (session.process && typeof session.process.kill === 'function') {
        session.process.kill('SIGTERM');
      }
    } catch (error) {
      this.logger.warn(
        `Error killing process for session ${sessionId}: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }

    // Update session status
    session.status = SessionStatus.TERMINATED;

    // Clean up workspace sensitive files
    await this.workspaceManager.cleanupWorkspace(
      session.workspaceId,
      session.projectId,
    );

    // Emit terminated event
    this.emitSessionEvent({
      type: 'cli:session:terminated',
      sessionId,
      agentId: session.agentId,
      agentType: session.agentType,
      workspaceId: session.workspaceId,
      projectId: session.projectId,
      timestamp: new Date(),
    });

    // Remove from active sessions
    this.activeSessions.delete(sessionId);

    this.logger.log(`CLI session ${sessionId} terminated`);
  }

  /**
   * Get all active sessions as a read-only snapshot.
   * Returns a new Map so callers cannot mutate internal state.
   */
  getActiveSessions(): ReadonlyMap<string, TrackedSession> {
    return new Map(this.activeSessions);
  }

  /**
   * Get the count of currently active (RUNNING) sessions.
   */
  getActiveSessionCount(): number {
    let count = 0;
    for (const session of this.activeSessions.values()) {
      if (session.status === SessionStatus.RUNNING) {
        count++;
      }
    }
    return count;
  }

  /**
   * Spawn the actual CLI child process.
   */
  private spawnCLIProcess(
    config: { apiKey: string; task: string; model?: string; maxTokens: number; timeout: number },
    workspacePath: string,
  ): ChildProcess {
    // Build CLI arguments
    const args: string[] = [
      '--print',
      config.task,
      '--output-format', 'stream-json',
    ];

    if (config.model) {
      args.push('--model', config.model);
    }

    args.push('--max-turns', '100');

    // Spawn the process with ANTHROPIC_API_KEY in environment only
    const childProcess = spawn('claude', args, {
      cwd: workspacePath,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: config.apiKey,
        GIT_TERMINAL_PROMPT: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return childProcess;
  }

  /**
   * Set up event handlers for the child process.
   * @param sessionId - Session identifier
   * @param childProcess - The spawned child process
   * @param timeoutMs - Session timeout in milliseconds (from config)
   */
  private setupProcessHandlers(
    sessionId: string,
    childProcess: ChildProcess,
    timeoutMs: number,
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    // Track output lines
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        if (session) {
          session.outputLineCount += lines.length;
        }
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        const content = data.toString();
        // Only log non-sensitive stderr output
        if (!content.includes('sk-ant-') && !content.includes('ANTHROPIC_API_KEY')) {
          this.logger.warn(`Session ${sessionId} stderr: ${content.substring(0, 200)}`);
        }
      });
    }

    // Set up timeout using configured value; store timer ref for cleanup
    const timeoutTimer = setTimeout(() => {
      const currentSession = this.activeSessions.get(sessionId);
      if (currentSession && currentSession.status === SessionStatus.RUNNING) {
        this.logger.warn(`CLI session ${sessionId} timed out after ${timeoutMs}ms`);
        currentSession.status = SessionStatus.TIMED_OUT;
        this.terminateSession(sessionId);
      }
    }, timeoutMs);

    // Handle process exit
    childProcess.on('exit', (code: number | null) => {
      // Clear timeout timer to prevent memory leak
      clearTimeout(timeoutTimer);

      if (session) {
        if (code === 0) {
          session.status = SessionStatus.COMPLETED;
          this.emitSessionEvent({
            type: 'cli:session:completed',
            sessionId,
            agentId: session.agentId,
            agentType: session.agentType,
            workspaceId: session.workspaceId,
            projectId: session.projectId,
            timestamp: new Date(),
            metadata: { exitCode: code },
          });
        } else if (session.status !== SessionStatus.TERMINATED) {
          session.status = SessionStatus.FAILED;
          this.emitSessionEvent({
            type: 'cli:session:failed',
            sessionId,
            agentId: session.agentId,
            agentType: session.agentType,
            workspaceId: session.workspaceId,
            projectId: session.projectId,
            timestamp: new Date(),
            metadata: { exitCode: code },
          });
        }
      }

      this.logger.log(
        `CLI session ${sessionId} exited with code ${code}`,
      );
    });

    // Handle process error
    childProcess.on('error', (error: Error) => {
      // Clear timeout timer to prevent memory leak
      clearTimeout(timeoutTimer);

      if (session) {
        session.status = SessionStatus.FAILED;
        this.emitSessionEvent({
          type: 'cli:session:failed',
          sessionId,
          agentId: session.agentId,
          agentType: session.agentType,
          workspaceId: session.workspaceId,
          projectId: session.projectId,
          timestamp: new Date(),
          metadata: { error: error.message },
        });
      }
      this.logger.error(
        `CLI session ${sessionId} process error: ${error.message}`,
      );
    });
  }

  /**
   * Emit a session event via EventEmitter2.
   */
  private emitSessionEvent(event: CLISessionEvent): void {
    this.eventEmitter.emit(event.type, event);
  }
}
