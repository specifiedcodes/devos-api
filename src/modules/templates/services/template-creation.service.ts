/**
 * TemplateCreationService
 *
 * Story 19-2: Template Creation Wizard (AC2)
 *
 * Service for creating templates from existing projects or GitHub repositories.
 * Handles file scanning, pattern detection, templatization, and template definition generation.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  BadGatewayException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TemplateRegistryService } from './template-registry.service';
import { TemplateAuditService } from './template-audit.service';
import { GitHubService } from '../../integrations/github/github.service';
import { FileStorageService } from '../../file-storage/file-storage.service';
import {
  Template,
  TemplateCategory,
  TemplateSourceType,
  TemplateDefinitionSpec,
} from '../../../database/entities/template.entity';
import { Project } from '../../../database/entities/project.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import {
  IntegrationConnection,
  IntegrationProvider,
  IntegrationStatus,
} from '../../../database/entities/integration-connection.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import {
  CreateTemplateFromProjectDto,
  SourceConfigDto,
  VariableDefinitionDto,
  TemplatizePatternDto,
} from '../dto/create-template-from-project.dto';
import { DEFAULT_EXCLUDE_PATTERNS, DETECTION_RULES } from '../constants/template-creation.constants';

/** Maximum file size to scan (1MB) */
const MAX_FILE_SIZE = 1024 * 1024;

/** Pattern types for detection */
export type PatternType = 'project_name' | 'database_url' | 'api_key' | 'port' | 'env_var' | 'custom';

/** Detected pattern result */
export interface DetectedPattern {
  type: PatternType;
  pattern: string;
  suggestedVariable: string;
  occurrences: Array<{
    file: string;
    line: number;
    context: string;
  }>;
  confidence: number;
}

/** File content structure */
export interface FileContent {
  path: string;
  content: string;
}

/** File tree node structure */
export interface FileTreeNode {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileTreeNode[];
}

/** Pattern detection rule */
interface PatternRule {
  type: PatternType;
  regex: RegExp;
  suggestedVariable: string;
  confidence: number;
  filePatterns?: string[];
}

@Injectable()
export class TemplateCreationService {
  private readonly logger = new Logger(TemplateCreationService.name);

  constructor(
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepository: Repository<WorkspaceMember>,
    @InjectRepository(IntegrationConnection)
    private readonly integrationConnectionRepository: Repository<IntegrationConnection>,
    private readonly encryptionService: EncryptionService,
    private readonly templateRegistryService: TemplateRegistryService,
    private readonly gitHubService: GitHubService,
    private readonly fileStorageService: FileStorageService,
    private readonly auditService: TemplateAuditService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a template definition from an existing project.
   * Scans project files, detects patterns, applies templatization.
   */
  async createFromProject(
    workspaceId: string,
    userId: string,
    dto: CreateTemplateFromProjectDto,
  ): Promise<Template> {
    this.logger.log(`Creating template from project: ${dto.source.projectId}`);

    // Verify workspace membership
    const membership = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });

    if (!membership) {
      throw new ForbiddenException('User is not a member of this workspace');
    }

    if (membership.role === WorkspaceRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot create templates');
    }

    // Get project
    const project = await this.projectRepository.findOne({
      where: { id: dto.source.projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID '${dto.source.projectId}' not found`);
    }

    // Check for duplicate name
    const existing = await this.templateRegistryService.findByName(workspaceId, dto.name);
    if (existing) {
      throw new BadRequestException(`Template with name '${dto.name}' already exists in this workspace`);
    }

    // Get file contents from project's GitHub repo
    let files: FileContent[] = [];
    if (project.githubRepoUrl) {
      const { owner, repo } = this.parseGitHubUrl(project.githubRepoUrl);
      const githubToken = await this.getGithubToken(workspaceId);

      files = await this.fetchFilesFromGitHub(
        githubToken,
        owner,
        repo,
        dto.source.branch || 'main',
        dto.source.includePaths,
        dto.source.excludePaths || DEFAULT_EXCLUDE_PATTERNS,
      );
    }

    // Apply templatization
    const templatizedFiles = await this.applyTemplatization(
      files,
      dto.templatizePatterns || [],
    );

    // Build template definition
    const definition = this.buildTemplateDefinition(
      templatizedFiles,
      dto.variables,
      dto.source,
      dto.postInstall,
    );

    // Create template entity
    const template = await this.templateRegistryService.create(
      workspaceId,
      {
        name: dto.name,
        displayName: dto.displayName,
        description: dto.description,
        longDescription: dto.longDescription,
        category: dto.category,
        tags: dto.tags,
        icon: dto.icon,
        version: '1.0.0',
        definition: definition as any,
        variables: dto.variables,
        sourceType: TemplateSourceType.INLINE,
        sourceUrl: project.githubRepoUrl,
        sourceBranch: dto.source.branch || 'main',
        isPublished: !dto.isDraft,
      },
      userId,
    );

    // Log audit event
    await this.auditService.logTemplateCreated(workspaceId, template.id, userId, {
      name: template.name,
      sourceType: 'project',
      sourceProjectId: dto.source.projectId,
    });

    return template;
  }

  /**
   * Create a template definition from an external GitHub repository.
   * Clones repo, scans files, detects patterns, applies templatization.
   */
  async createFromGitHub(
    workspaceId: string,
    userId: string,
    dto: CreateTemplateFromProjectDto,
  ): Promise<Template> {
    this.logger.log(`Creating template from GitHub: ${dto.source.githubUrl}`);

    // Get user's GitHub token from workspace integration
    const githubToken = await this.getGithubToken(workspaceId);

    // Parse GitHub URL
    const { owner, repo } = this.parseGitHubUrl(dto.source.githubUrl!);

    // Verify repo access
    const repoInfo = await this.gitHubService.getRepository(
      githubToken,
      owner,
      repo,
    );

    if (!repoInfo) {
      throw new NotFoundException(`GitHub repository '${owner}/${repo}' not found or access denied`);
    }

    // Check for duplicate name
    const existing = await this.templateRegistryService.findByName(workspaceId, dto.name);
    if (existing) {
      throw new BadRequestException(`Template with name '${dto.name}' already exists`);
    }

    // Fetch files from GitHub
    const files = await this.fetchFilesFromGitHub(
      githubToken,
      owner,
      repo,
      dto.source.branch || 'main',
      dto.source.includePaths,
      dto.source.excludePaths || DEFAULT_EXCLUDE_PATTERNS,
    );

    // Apply templatization
    const templatizedFiles = await this.applyTemplatization(
      files,
      dto.templatizePatterns || [],
    );

    // Build template definition
    const definition = this.buildTemplateDefinition(
      templatizedFiles,
      dto.variables,
      dto.source,
      dto.postInstall,
    );

    // Create template entity
    const template = await this.templateRegistryService.create(
      workspaceId,
      {
        name: dto.name,
        displayName: dto.displayName,
        description: dto.description,
        longDescription: dto.longDescription,
        category: dto.category,
        tags: dto.tags,
        icon: dto.icon,
        version: '1.0.0',
        definition: definition as any,
        variables: dto.variables,
        sourceType: TemplateSourceType.GIT,
        sourceUrl: dto.source.githubUrl,
        sourceBranch: dto.source.branch || 'main',
        isPublished: !dto.isDraft,
      },
      userId,
    );

    // Log audit event
    await this.auditService.logTemplateCreated(workspaceId, template.id, userId, {
      name: template.name,
      sourceType: 'github_url',
      sourceUrl: dto.source.githubUrl,
    });

    return template;
  }

  /**
   * Scan files and detect common patterns for templatization.
   * Returns detected patterns with suggested variable names.
   */
  async detectPatterns(files: FileContent[]): Promise<DetectedPattern[]> {
    const patterns: Map<string, DetectedPattern> = new Map();

    for (const file of files) {
      const lines = file.content.split('\n');

      for (const rule of DETECTION_RULES) {
        // Skip if file pattern doesn't match
        if (rule.filePatterns && !rule.filePatterns.some((fp) => file.path.includes(fp))) {
          // For file-specific rules like package.json, only check matching files
          if (rule.type === 'project_name' && !file.path.endsWith('package.json')) {
            continue;
          }
        }

        let match;
        const regex = new RegExp(rule.regex.source, rule.regex.flags);

        while ((match = regex.exec(file.content)) !== null) {
          const pattern = match[1] || match[0];
          const key = `${rule.type}:${pattern}`;

          // Find line number
          const lineNum = file.content.substring(0, match.index).split('\n').length;
          const lineContent = lines[lineNum - 1] || '';

          // Get surrounding context
          const contextStart = Math.max(0, match.index - 30);
          const contextEnd = Math.min(file.content.length, match.index + match[0].length + 30);
          const context = file.content.substring(contextStart, contextEnd);

          if (patterns.has(key)) {
            const existing = patterns.get(key)!;
            existing.occurrences.push({
              file: file.path,
              line: lineNum,
              context,
            });
            // Increase confidence with more occurrences
            existing.confidence = Math.min(1.0, existing.confidence + 0.05);
          } else {
            patterns.set(key, {
              type: rule.type,
              pattern: pattern,
              suggestedVariable: rule.suggestedVariable,
              occurrences: [
                {
                  file: file.path,
                  line: lineNum,
                  context,
                },
              ],
              confidence: rule.confidence,
            });
          }
        }
      }
    }

    // Also check .env.example for environment variables
    const envExampleFile = files.find((f) => f.path.endsWith('.env.example'));
    if (envExampleFile) {
      const envLines = envExampleFile.content.split('\n');
      for (const line of envLines) {
        const envMatch = line.match(/^([A-Z][A-Z0-9_]*)=/);
        if (envMatch) {
          const varName = envMatch[1];
          const key = `env_var:${varName}`;
          const varNameLower = varName.toLowerCase().replace(/_/g, '_');

          if (!patterns.has(key)) {
            patterns.set(key, {
              type: 'env_var',
              pattern: varName,
              suggestedVariable: varNameLower,
              occurrences: [
                {
                  file: envExampleFile.path,
                  line: envLines.indexOf(line) + 1,
                  context: line,
                },
              ],
              confidence: 0.7,
            });
          }
        }
      }
    }

    return Array.from(patterns.values()).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Apply templatization patterns to file contents.
   * Replaces matched patterns with {{variable}} placeholders.
   */
  async applyTemplatization(
    files: FileContent[],
    patterns: TemplatizePatternDto[],
  ): Promise<FileContent[]> {
    if (patterns.length === 0) {
      return files;
    }

    return files.map((file) => {
      let content = file.content;

      for (const pattern of patterns) {
        // Check if this pattern should apply to this file
        if (pattern.files && pattern.files.length > 0) {
          const shouldApply = pattern.files.some((fp) => {
            // Simple glob matching
            if (fp.includes('*')) {
              const regex = new RegExp(fp.replace(/\*/g, '.*'));
              return regex.test(file.path);
            }
            return file.path === fp || file.path.includes(fp);
          });

          if (!shouldApply) {
            continue;
          }
        }

        // Replace pattern with variable placeholder
        try {
          const regex = new RegExp(pattern.pattern, 'g');
          content = content.replace(regex, `{{${pattern.variable}}}`);
        } catch (e) {
          // If pattern is not a valid regex, treat it as literal string
          content = content.split(pattern.pattern).join(`{{${pattern.variable}}}`);
        }
      }

      return { ...file, content };
    });
  }

  /**
   * Generate template definition JSON from scanned files and config.
   */
  buildTemplateDefinition(
    files: FileContent[],
    variables: VariableDefinitionDto[],
    sourceConfig: SourceConfigDto,
    postInstall?: string[],
  ): TemplateDefinitionSpec {
    // Build inline files map
    const inlineFiles: Record<string, string> = {};
    let detectedProjectName = 'my-project';

    for (const file of files) {
      inlineFiles[file.path] = file.content;

      // Try to extract project name from package.json
      if (file.path.endsWith('package.json')) {
        try {
          const pkg = JSON.parse(file.content);
          if (pkg.name && typeof pkg.name === 'string') {
            detectedProjectName = pkg.name.replace(/{{.*?}}/g, 'my-project');
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Detect stack from files
    const stack = this.detectStack(files);

    return {
      apiVersion: 'devos.com/v1',
      kind: 'Template',
      metadata: {
        name: variables.find((v) => v.name === 'project_name')?.default as string || detectedProjectName,
      },
      spec: {
        stack,
        variables: variables.map((v) => ({
          name: v.name,
          type: v.type,
          display_name: v.displayName,
          description: v.description,
          required: v.required,
          default: v.default,
          options: v.options,
          validation: v.validation,
          min: v.min,
          max: v.max,
        })),
        files: {
          source_type: 'inline',
          inline_files: inlineFiles,
        },
        post_install: postInstall || [],
      },
    } as any;
  }

  /**
   * Get file tree preview for a project or GitHub repo.
   * Returns file structure without content for UI preview.
   */
  async getFileTreePreview(
    source: SourceConfigDto,
    workspaceId: string,
    includePaths?: string[],
    excludePaths?: string[],
  ): Promise<{
    tree: FileTreeNode[];
    totalFiles: number;
    totalDirectories: number;
    totalSize: number;
  }> {
    const exclude = excludePaths || DEFAULT_EXCLUDE_PATTERNS;

    if (source.type === 'project') {
      const project = await this.projectRepository.findOne({
        where: { id: source.projectId },
      });

      if (!project || !project.githubRepoUrl) {
        return { tree: [], totalFiles: 0, totalDirectories: 0, totalSize: 0 };
      }

      const { owner, repo } = this.parseGitHubUrl(project.githubRepoUrl);

      try {
        const githubToken = await this.getGithubToken(workspaceId);
        return this.fetchFileTreeFromGitHub(
          githubToken,
          owner,
          repo,
          source.branch || 'main',
          includePaths,
          exclude,
        );
      } catch {
        return { tree: [], totalFiles: 0, totalDirectories: 0, totalSize: 0 };
      }
    }

    if (source.type === 'github_url') {
      const { owner, repo } = this.parseGitHubUrl(source.githubUrl!);

      try {
        const githubToken = await this.getGithubToken(workspaceId);
        return this.fetchFileTreeFromGitHub(
          githubToken,
          owner,
          repo,
          source.branch || 'main',
          includePaths,
          exclude,
        );
      } catch {
        return { tree: [], totalFiles: 0, totalDirectories: 0, totalSize: 0 };
      }
    }

    return { tree: [], totalFiles: 0, totalDirectories: 0, totalSize: 0 };
  }

  /**
   * Get file contents for pattern detection.
   * Respects include/exclude patterns.
   */
  async getFileContents(
    source: SourceConfigDto,
    workspaceId: string,
    includePaths?: string[],
    excludePaths?: string[],
  ): Promise<FileContent[]> {
    const exclude = excludePaths || DEFAULT_EXCLUDE_PATTERNS;

    if (source.type === 'project') {
      const project = await this.projectRepository.findOne({
        where: { id: source.projectId },
      });

      if (!project || !project.githubRepoUrl) {
        return [];
      }

      const { owner, repo } = this.parseGitHubUrl(project.githubRepoUrl);

      try {
        const githubToken = await this.getGithubToken(workspaceId);
        return this.fetchFilesFromGitHub(
          githubToken,
          owner,
          repo,
          source.branch || 'main',
          includePaths,
          exclude,
        );
      } catch {
        return [];
      }
    }

    if (source.type === 'github_url') {
      const { owner, repo } = this.parseGitHubUrl(source.githubUrl!);

      try {
        const githubToken = await this.getGithubToken(workspaceId);
        return this.fetchFilesFromGitHub(
          githubToken,
          owner,
          repo,
          source.branch || 'main',
          includePaths,
          exclude,
        );
      } catch {
        return [];
      }
    }

    return [];
  }

  /**
   * Validate that a user has access to a workspace.
   * Throws ForbiddenException if user is not a member or is a viewer.
   */
  async validateWorkspaceAccess(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });

    if (!membership) {
      throw new ForbiddenException('User is not a member of this workspace');
    }

    if (membership.role === WorkspaceRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot access this resource');
    }
  }

  // ---- Private Helper Methods ----

  /**
   * Parse GitHub URL to extract owner and repo
   */
  private parseGitHubUrl(url: string): { owner: string; repo: string } {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      throw new BadRequestException(`Invalid GitHub URL: ${url}`);
    }
    return { owner: match[1], repo: match[2].replace('.git', '') };
  }

  /**
   * Get user's decrypted GitHub token from workspace integration
   */
  private async getGithubToken(workspaceId: string): Promise<string> {
    const integration = await this.integrationConnectionRepository.findOne({
      where: {
        workspaceId,
        provider: IntegrationProvider.GITHUB,
        status: IntegrationStatus.ACTIVE,
      },
    });

    if (!integration) {
      throw new ForbiddenException('GitHub connection required. Please connect your GitHub account.');
    }

    try {
      const decryptedToken = this.encryptionService.decryptWithWorkspaceKey(
        workspaceId,
        integration.encryptedAccessToken,
        integration.encryptionIV,
      );

      // Update lastUsedAt timestamp
      integration.lastUsedAt = new Date();
      await this.integrationConnectionRepository.save(integration);

      return decryptedToken;
    } catch (error) {
      this.logger.error(`Failed to decrypt GitHub token for workspace ${workspaceId}`);
      throw new ForbiddenException('Failed to access GitHub integration. Please reconnect.');
    }
  }

  /**
   * Fetch files from GitHub repository
   */
  private async fetchFilesFromGitHub(
    accessToken: string,
    owner: string,
    repo: string,
    branch: string,
    includePaths?: string[],
    excludePaths?: string[],
  ): Promise<FileContent[]> {
    const files: FileContent[] = [];
    const octokit = this.gitHubService.getClient(accessToken);

    const fetchDirectory = async (path: string = ''): Promise<void> => {
      try {
        const response = await octokit.repos.getContent({
          owner,
          repo,
          path,
          ref: branch,
        });

        const contents = Array.isArray(response.data) ? response.data : [response.data];

        for (const item of contents) {
          if (item.type === 'dir') {
            // Check exclude patterns
            if (this.shouldExclude(item.path, excludePaths)) {
              continue;
            }
            await fetchDirectory(item.path);
          } else if (item.type === 'file') {
            // Check include/exclude patterns
            if (this.shouldExclude(item.path, excludePaths)) {
              continue;
            }
            if (includePaths && includePaths.length > 0 && !this.shouldInclude(item.path, includePaths)) {
              continue;
            }

            // Skip large files
            if (item.size && item.size > MAX_FILE_SIZE) {
              continue;
            }

            try {
              const fileResponse = await octokit.repos.getContent({
                owner,
                repo,
                path: item.path,
                ref: branch,
              });

              if ('content' in fileResponse.data && !Array.isArray(fileResponse.data)) {
                const content = Buffer.from(fileResponse.data.content, 'base64').toString('utf-8');
                files.push({ path: item.path, content });
              }
            } catch (e) {
              this.logger.warn(`Failed to fetch file ${item.path}: ${e}`);
            }
          }
        }
      } catch (e) {
        this.logger.warn(`Failed to fetch directory ${path}: ${e}`);
      }
    };

    await fetchDirectory();
    return files;
  }

  /**
   * Fetch file tree from GitHub repository
   */
  private async fetchFileTreeFromGitHub(
    accessToken: string,
    owner: string,
    repo: string,
    branch: string,
    includePaths?: string[],
    excludePaths?: string[],
  ): Promise<{
    tree: FileTreeNode[];
    totalFiles: number;
    totalDirectories: number;
    totalSize: number;
  }> {
    const tree: FileTreeNode[] = [];
    let totalFiles = 0;
    let totalDirectories = 0;
    let totalSize = 0;

    const octokit = this.gitHubService.getClient(accessToken);

    const fetchDirectory = async (path: string = ''): Promise<FileTreeNode[]> => {
      const nodes: FileTreeNode[] = [];

      try {
        const response = await octokit.repos.getContent({
          owner,
          repo,
          path,
          ref: branch,
        });

        const contents = Array.isArray(response.data) ? response.data : [response.data];

        for (const item of contents) {
          // Check exclude patterns
          if (this.shouldExclude(item.path, excludePaths)) {
            continue;
          }
          if (includePaths && includePaths.length > 0 && !this.shouldInclude(item.path, includePaths)) {
            continue;
          }

          if (item.type === 'dir') {
            totalDirectories++;
            const children = await fetchDirectory(item.path);
            nodes.push({
              path: item.path,
              type: 'directory',
              children,
            });
          } else if (item.type === 'file') {
            totalFiles++;
            totalSize += item.size || 0;
            nodes.push({
              path: item.path,
              type: 'file',
              size: item.size,
            });
          }
        }
      } catch (e) {
        this.logger.warn(`Failed to fetch tree for ${path}: ${e}`);
      }

      return nodes;
    };

    const result = await fetchDirectory();
    return { tree: result, totalFiles, totalDirectories, totalSize };
  }

  /**
   * Check if path should be excluded
   */
  private shouldExclude(path: string, excludePaths?: string[]): boolean {
    if (!excludePaths || excludePaths.length === 0) {
      return false;
    }

    for (const pattern of excludePaths) {
      // Handle negation patterns (e.g., !.env.example)
      if (pattern.startsWith('!')) {
        const negatedPattern = pattern.substring(1);
        if (this.matchesPattern(path, negatedPattern)) {
          return false; // Explicitly include this
        }
        continue;
      }

      if (this.matchesPattern(path, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if path should be included
   */
  private shouldInclude(path: string, includePaths: string[]): boolean {
    if (!includePaths || includePaths.length === 0) {
      return true;
    }

    return includePaths.some((pattern) => this.matchesPattern(path, pattern));
  }

  /**
   * Simple glob pattern matching
   */
  private matchesPattern(path: string, pattern: string): boolean {
    // Convert glob to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<DOUBLESTAR>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<DOUBLESTAR>>/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * Detect technology stack from files
   */
  private detectStack(files: FileContent[]): TemplateDefinitionSpec['stack'] {
    const stack: TemplateDefinitionSpec['stack'] = {};

    for (const file of files) {
      // Detect frontend
      if (file.path.endsWith('package.json')) {
        try {
          const pkg = JSON.parse(file.content);
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };

          if (deps.next || deps['next.js']) {
            stack.frontend = 'Next.js';
          } else if (deps.react) {
            stack.frontend = 'React';
          } else if (deps.vue) {
            stack.frontend = 'Vue.js';
          }

          if (deps.tailwindcss) {
            stack.styling = 'Tailwind CSS';
          }

          if (deps.prisma) {
            stack.database = 'PostgreSQL (Prisma)';
          }
        } catch {
          // Ignore parse errors
        }
      }

      // Detect backend
      if (file.path.includes('nest') || file.path.includes('nestjs')) {
        stack.backend = 'NestJS';
      }

      // Detect TypeScript
      if (file.path.endsWith('.ts') || file.path.endsWith('.tsx')) {
        // TypeScript is inferred
      }
    }

    return stack;
  }
}
