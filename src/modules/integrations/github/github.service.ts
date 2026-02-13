import {
  Injectable,
  Logger,
  ConflictException,
  BadGatewayException,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Octokit } from '@octokit/rest';
import { GitHubRepoResponseDto } from './dto/repo-response.dto';
import {
  BranchResponseDto,
  BranchDetailResponseDto,
  BranchListResponseDto,
} from './dto/branch.dto';
import {
  PullRequestResponseDto,
  PullRequestListResponseDto,
  MergePullRequestResponseDto,
} from './dto/pull-request.dto';

/**
 * GitHubService
 * Story 6.1: GitHub OAuth Integration Setup
 * Story 6.2: GitHub Repository Creation (enhanced)
 * Story 6.4: GitHub Pull Request Creation (enhanced)
 *
 * Manages GitHub API interactions via Octokit.
 */
@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);

  /**
   * Get Octokit client for user's GitHub token
   */
  getClient(accessToken: string): Octokit {
    return new Octokit({
      auth: accessToken,
    });
  }

  /**
   * Map raw GitHub API repo response to typed DTO
   */
  private mapRepoResponse(data: any): GitHubRepoResponseDto {
    return {
      id: data.id,
      name: data.name,
      fullName: data.full_name,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
      sshUrl: data.ssh_url,
      private: data.private,
      defaultBranch: data.default_branch,
      description: data.description,
    };
  }

  /**
   * Create repository
   * Story 6.2: Enhanced with gitignoreTemplate, licenseTemplate, error handling, typed response
   *
   * @param accessToken - GitHub OAuth access token
   * @param name - Repository name
   * @param options - Repository creation options
   * @returns Typed GitHubRepoResponseDto
   */
  async createRepository(
    accessToken: string,
    name: string,
    options?: {
      description?: string;
      private?: boolean;
      autoInit?: boolean;
      gitignoreTemplate?: string;
      licenseTemplate?: string;
    },
  ): Promise<GitHubRepoResponseDto> {
    const octokit = this.getClient(accessToken);

    this.logger.log(`Creating GitHub repository: ${name}`);

    try {
      const response = await octokit.repos.createForAuthenticatedUser({
        name,
        description: options?.description,
        private: options?.private ?? true,
        auto_init: options?.autoInit ?? true,
        gitignore_template: options?.gitignoreTemplate,
        license_template: options?.licenseTemplate,
      });

      const mapped = this.mapRepoResponse(response.data);

      this.logger.log(
        `GitHub repository created: ${mapped.fullName} (${mapped.htmlUrl})`,
      );

      return mapped;
    } catch (error: any) {
      const status = error?.status;
      const message = error?.message || 'Unknown error';

      this.logger.error(
        `GitHub API error creating repository "${name}": status=${status}, message=${message}`,
      );

      if (status === 422) {
        throw new ConflictException(
          'Repository with this name already exists on GitHub',
        );
      }

      if (status === 403) {
        throw new BadGatewayException(
          'GitHub API rate limit exceeded. Please try again later.',
        );
      }

      throw new BadGatewayException(`GitHub API error: ${message}`);
    }
  }

  /**
   * Get repository information
   * Story 6.2: Used for link-existing-repo validation
   *
   * @param accessToken - GitHub OAuth access token
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns GitHubRepoResponseDto or null if 404
   */
  async getRepository(
    accessToken: string,
    owner: string,
    repo: string,
  ): Promise<GitHubRepoResponseDto | null> {
    const octokit = this.getClient(accessToken);

    this.logger.log(`Fetching GitHub repository: ${owner}/${repo}`);

    try {
      const response = await octokit.repos.get({ owner, repo });
      return this.mapRepoResponse(response.data);
    } catch (error: any) {
      const status = error?.status;

      if (status === 404) {
        this.logger.log(`GitHub repository not found: ${owner}/${repo}`);
        return null;
      }

      const message = error?.message || 'Unknown error';
      this.logger.error(
        `GitHub API error fetching repository "${owner}/${repo}": status=${status}, message=${message}`,
      );

      throw new BadGatewayException(`GitHub API error: ${message}`);
    }
  }

  /**
   * Create branch
   * Story 6.3: Enhanced with error handling and typed response
   *
   * @param accessToken - GitHub OAuth access token
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param branchName - New branch name
   * @param fromBranch - Source branch (default: "main")
   * @returns BranchResponseDto with branch details
   */
  async createBranch(
    accessToken: string,
    owner: string,
    repo: string,
    branchName: string,
    fromBranch: string = 'main',
  ): Promise<BranchResponseDto> {
    const octokit = this.getClient(accessToken);

    this.logger.log(
      `Creating branch ${branchName} from ${fromBranch} in ${owner}/${repo}`,
    );

    try {
      // Get ref of base branch
      const baseRef = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${fromBranch}`,
      });

      // Create new branch
      const response = await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: baseRef.data.object.sha,
      });

      this.logger.log(
        `Branch created: ${branchName} in ${owner}/${repo}`,
      );

      return {
        branchName,
        sha: response.data.object.sha,
        ref: response.data.ref,
        url: response.data.url,
      };
    } catch (error: any) {
      const status = error?.status;
      const message = error?.message || 'Unknown error';

      this.logger.error(
        `GitHub API error creating branch "${branchName}" in ${owner}/${repo}: status=${status}, message=${message}`,
      );

      if (status === 422) {
        throw new ConflictException('Branch already exists');
      }

      if (status === 404) {
        throw new NotFoundException('Source branch not found');
      }

      if (status === 403) {
        throw new BadGatewayException(
          'GitHub API rate limit exceeded. Please try again later.',
        );
      }

      throw new BadGatewayException(`GitHub API error: ${message}`);
    }
  }

  /**
   * List branches
   * Story 6.3: GitHub Branch Management
   *
   * @param accessToken - GitHub OAuth access token
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param options - Pagination and filter options
   * @returns BranchListResponseDto with paginated branch list
   */
  async listBranches(
    accessToken: string,
    owner: string,
    repo: string,
    options?: {
      page?: number;
      perPage?: number;
      protected?: boolean;
    },
  ): Promise<BranchListResponseDto> {
    const octokit = this.getClient(accessToken);

    this.logger.log(`Listing branches for ${owner}/${repo}`);

    try {
      const params: any = {
        owner,
        repo,
        per_page: options?.perPage || 30,
        page: options?.page || 1,
      };

      if (options?.protected !== undefined) {
        params.protected = options.protected;
      }

      const response = await octokit.repos.listBranches(params);

      const branches: BranchDetailResponseDto[] = response.data.map(
        (branch: any) => ({
          name: branch.name,
          sha: branch.commit.sha,
          protected: branch.protected,
          url: `https://api.github.com/repos/${owner}/${repo}/branches/${branch.name}`,
        }),
      );

      return {
        branches,
        total: branches.length, // Count of branches on this page (GitHub API does not provide a total count header easily)
      };
    } catch (error: any) {
      const status = error?.status;
      const message = error?.message || 'Unknown error';

      this.logger.error(
        `GitHub API error listing branches for ${owner}/${repo}: status=${status}, message=${message}`,
      );

      if (status === 403) {
        throw new BadGatewayException(
          'GitHub API rate limit exceeded. Please try again later.',
        );
      }

      throw new BadGatewayException(`GitHub API error: ${message}`);
    }
  }

  /**
   * Get branch details
   * Story 6.3: GitHub Branch Management
   *
   * @param accessToken - GitHub OAuth access token
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param branchName - Branch name to get details for
   * @returns BranchDetailResponseDto or null if not found
   */
  async getBranch(
    accessToken: string,
    owner: string,
    repo: string,
    branchName: string,
  ): Promise<BranchDetailResponseDto | null> {
    const octokit = this.getClient(accessToken);

    this.logger.log(
      `Getting branch ${branchName} details for ${owner}/${repo}`,
    );

    try {
      const response = await octokit.repos.getBranch({
        owner,
        repo,
        branch: branchName,
      });

      const data = response.data;

      return {
        name: data.name,
        sha: data.commit.sha,
        protected: data.protected,
        url: data._links?.html || `https://github.com/${owner}/${repo}/tree/${data.name}`,
        commit: {
          sha: data.commit.sha,
          message: data.commit.commit?.message || '',
          author: data.commit.commit?.author?.name || '',
          date: data.commit.commit?.author?.date || '',
        },
      };
    } catch (error: any) {
      const status = error?.status;

      if (status === 404) {
        this.logger.log(
          `Branch not found: ${branchName} in ${owner}/${repo}`,
        );
        return null;
      }

      const message = error?.message || 'Unknown error';
      this.logger.error(
        `GitHub API error getting branch "${branchName}" in ${owner}/${repo}: status=${status}, message=${message}`,
      );

      throw new BadGatewayException(`GitHub API error: ${message}`);
    }
  }

  /**
   * Delete branch
   * Story 6.3: GitHub Branch Management
   *
   * @param accessToken - GitHub OAuth access token
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param branchName - Branch name to delete
   */
  async deleteBranch(
    accessToken: string,
    owner: string,
    repo: string,
    branchName: string,
  ): Promise<void> {
    const octokit = this.getClient(accessToken);

    this.logger.log(`Deleting branch ${branchName} in ${owner}/${repo}`);

    try {
      await octokit.git.deleteRef({
        owner,
        repo,
        ref: `heads/${branchName}`,
      });

      this.logger.log(
        `Branch deleted: ${branchName} in ${owner}/${repo}`,
      );
    } catch (error: any) {
      const status = error?.status;
      const message = error?.message || 'Unknown error';

      this.logger.error(
        `GitHub API error deleting branch "${branchName}" in ${owner}/${repo}: status=${status}, message=${message}`,
      );

      if (status === 422 || status === 404) {
        throw new NotFoundException('Branch not found');
      }

      if (status === 403) {
        throw new BadGatewayException(
          'GitHub API rate limit exceeded. Please try again later.',
        );
      }

      throw new BadGatewayException(`GitHub API error: ${message}`);
    }
  }

  /**
   * Map raw GitHub API PR response to typed DTO
   * Story 6.4: GitHub Pull Request Creation
   */
  private mapPullRequestResponse(data: any): PullRequestResponseDto {
    return {
      id: data.id,
      number: data.number,
      title: data.title,
      body: data.body || undefined,
      state: data.state,
      htmlUrl: data.html_url,
      head: {
        ref: data.head?.ref,
        sha: data.head?.sha,
      },
      base: {
        ref: data.base?.ref,
        sha: data.base?.sha,
      },
      draft: data.draft || false,
      labels: (data.labels || []).map((label: any) =>
        typeof label === 'string' ? label : label.name,
      ),
      user: {
        login: data.user?.login || '',
        avatarUrl: data.user?.avatar_url || '',
      },
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      mergeableState: data.mergeable_state || undefined,
      mergeable: data.mergeable != null ? data.mergeable : undefined,
      diffUrl: data.diff_url || undefined,
      additions: data.additions != null ? data.additions : undefined,
      deletions: data.deletions != null ? data.deletions : undefined,
      changedFiles: data.changed_files != null ? data.changed_files : undefined,
    };
  }

  /**
   * Create pull request
   * Story 6.4: Enhanced with error handling, typed response, and draft support
   *
   * @param accessToken - GitHub OAuth access token
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param options - Pull request creation options
   * @returns PullRequestResponseDto
   */
  async createPullRequest(
    accessToken: string,
    owner: string,
    repo: string,
    options: {
      title: string;
      head: string;
      base: string;
      body?: string;
      draft?: boolean;
    },
  ): Promise<PullRequestResponseDto> {
    const octokit = this.getClient(accessToken);

    this.logger.log(`Creating PR in ${owner}/${repo}: ${options.title}`);

    try {
      const response = await octokit.pulls.create({
        owner,
        repo,
        title: options.title,
        head: options.head,
        base: options.base,
        body: options.body,
        draft: options.draft || false,
      });

      this.logger.log(
        `PR created: #${response.data.number} in ${owner}/${repo}`,
      );

      return this.mapPullRequestResponse(response.data);
    } catch (error: any) {
      const status = error?.status;
      const message = error?.message || 'Unknown error';

      this.logger.error(
        `GitHub API error creating PR in ${owner}/${repo}: status=${status}, message=${message}`,
      );

      if (status === 422) {
        throw new ConflictException(
          'Pull request already exists for this head and base branch combination',
        );
      }

      if (status === 404) {
        throw new NotFoundException('Head or base branch not found');
      }

      if (status === 403) {
        throw new BadGatewayException('GitHub API rate limit exceeded');
      }

      throw new BadGatewayException(`GitHub API error: ${message}`);
    }
  }

  /**
   * List pull requests
   * Story 6.4: GitHub Pull Request Creation
   *
   * @param accessToken - GitHub OAuth access token
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param options - Filtering and pagination options
   * @returns PullRequestListResponseDto
   */
  async listPullRequests(
    accessToken: string,
    owner: string,
    repo: string,
    options?: {
      state?: string;
      sort?: string;
      direction?: string;
      page?: number;
      perPage?: number;
    },
  ): Promise<PullRequestListResponseDto> {
    const octokit = this.getClient(accessToken);

    this.logger.log(`Listing PRs for ${owner}/${repo}`);

    try {
      const response = await octokit.pulls.list({
        owner,
        repo,
        state: (options?.state as any) || 'open',
        sort: (options?.sort as any) || 'created',
        direction: (options?.direction as any) || 'desc',
        per_page: options?.perPage || 30,
        page: options?.page || 1,
      });

      const pullRequests = response.data.map((pr: any) =>
        this.mapPullRequestResponse(pr),
      );

      return {
        pullRequests,
        total: pullRequests.length, // Note: this is the count on this page, not total across all pages (GitHub API pagination uses Link headers)
      };
    } catch (error: any) {
      const status = error?.status;
      const message = error?.message || 'Unknown error';

      this.logger.error(
        `GitHub API error listing PRs for ${owner}/${repo}: status=${status}, message=${message}`,
      );

      if (status === 403) {
        throw new BadGatewayException('GitHub API rate limit exceeded');
      }

      throw new BadGatewayException(`GitHub API error: ${message}`);
    }
  }

  /**
   * Get pull request details
   * Story 6.4: GitHub Pull Request Creation
   *
   * @param accessToken - GitHub OAuth access token
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - PR number
   * @returns PullRequestResponseDto or null if not found
   */
  async getPullRequest(
    accessToken: string,
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<PullRequestResponseDto | null> {
    const octokit = this.getClient(accessToken);

    this.logger.log(`Getting PR #${pullNumber} for ${owner}/${repo}`);

    try {
      const response = await octokit.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });

      return this.mapPullRequestResponse(response.data);
    } catch (error: any) {
      const status = error?.status;

      if (status === 404) {
        this.logger.log(
          `PR #${pullNumber} not found in ${owner}/${repo}`,
        );
        return null;
      }

      const message = error?.message || 'Unknown error';
      this.logger.error(
        `GitHub API error getting PR #${pullNumber} in ${owner}/${repo}: status=${status}, message=${message}`,
      );

      throw new BadGatewayException(`GitHub API error: ${message}`);
    }
  }

  /**
   * Update pull request
   * Story 6.4: GitHub Pull Request Creation
   *
   * @param accessToken - GitHub OAuth access token
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - PR number
   * @param options - Fields to update
   * @returns Updated PullRequestResponseDto
   */
  async updatePullRequest(
    accessToken: string,
    owner: string,
    repo: string,
    pullNumber: number,
    options: {
      title?: string;
      body?: string;
      state?: string;
      base?: string;
    },
  ): Promise<PullRequestResponseDto> {
    const octokit = this.getClient(accessToken);

    this.logger.log(`Updating PR #${pullNumber} in ${owner}/${repo}`);

    try {
      const response = await octokit.pulls.update({
        owner,
        repo,
        pull_number: pullNumber,
        title: options.title,
        body: options.body,
        state: options.state as any,
        base: options.base,
      });

      return this.mapPullRequestResponse(response.data);
    } catch (error: any) {
      const status = error?.status;
      const message = error?.message || 'Unknown error';

      this.logger.error(
        `GitHub API error updating PR #${pullNumber} in ${owner}/${repo}: status=${status}, message=${message}`,
      );

      if (status === 404) {
        throw new NotFoundException('Pull request not found');
      }

      if (status === 422) {
        throw new BadRequestException('Invalid pull request update');
      }

      throw new BadGatewayException(`GitHub API error: ${message}`);
    }
  }

  /**
   * Merge pull request
   * Story 6.4: GitHub Pull Request Creation
   *
   * @param accessToken - GitHub OAuth access token
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - PR number
   * @param options - Merge options
   * @returns MergePullRequestResponseDto
   */
  async mergePullRequest(
    accessToken: string,
    owner: string,
    repo: string,
    pullNumber: number,
    options?: {
      mergeMethod?: string;
      commitTitle?: string;
      commitMessage?: string;
    },
  ): Promise<MergePullRequestResponseDto> {
    const octokit = this.getClient(accessToken);

    this.logger.log(`Merging PR #${pullNumber} in ${owner}/${repo}`);

    try {
      const response = await octokit.pulls.merge({
        owner,
        repo,
        pull_number: pullNumber,
        merge_method: (options?.mergeMethod as any) || 'squash',
        commit_title: options?.commitTitle,
        commit_message: options?.commitMessage,
      });

      this.logger.log(
        `PR #${pullNumber} merged in ${owner}/${repo}`,
      );

      return {
        merged: response.data.merged,
        sha: response.data.sha,
        message: response.data.message,
      };
    } catch (error: any) {
      const status = error?.status;
      const message = error?.message || 'Unknown error';

      this.logger.error(
        `GitHub API error merging PR #${pullNumber} in ${owner}/${repo}: status=${status}, message=${message}`,
      );

      if (status === 405) {
        throw new HttpException(
          'Pull request is not mergeable',
          HttpStatus.METHOD_NOT_ALLOWED,
        );
      }

      if (status === 409) {
        throw new ConflictException(
          'Head branch was modified. Review and try the merge again.',
        );
      }

      if (status === 404) {
        throw new NotFoundException('Pull request not found');
      }

      if (status === 403) {
        throw new BadGatewayException('GitHub API rate limit exceeded');
      }

      throw new BadGatewayException(`GitHub API error: ${message}`);
    }
  }

  /**
   * Add labels to an issue/PR
   * Story 6.4: GitHub Pull Request Creation
   *
   * PRs in GitHub are issues, so octokit.issues.addLabels works for PR labels.
   * This method silently catches errors since labels are non-critical.
   *
   * @param accessToken - GitHub OAuth access token
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue/PR number
   * @param labels - Labels to add
   */
  async addLabelsToIssue(
    accessToken: string,
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void> {
    const octokit = this.getClient(accessToken);

    try {
      await octokit.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels,
      });
    } catch (error: any) {
      const message = error?.message || 'Unknown error';
      this.logger.warn(
        `Failed to add labels to PR #${issueNumber}: ${message}`,
      );
    }
  }

  /**
   * Get user info
   */
  async getUserInfo(accessToken: string): Promise<any> {
    const octokit = this.getClient(accessToken);

    const response = await octokit.users.getAuthenticated();

    return response.data;
  }

  /**
   * List repositories
   */
  async listRepositories(accessToken: string): Promise<any[]> {
    const octokit = this.getClient(accessToken);

    const response = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
    });

    return response.data;
  }
}
