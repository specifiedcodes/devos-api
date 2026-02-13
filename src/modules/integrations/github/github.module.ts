import { Module } from '@nestjs/common';
import { GitHubService } from './github.service';

/**
 * GitHubModule
 * Stories 6.1-6.4: GitHub integration
 */
@Module({
  providers: [GitHubService],
  exports: [GitHubService],
})
export class GitHubModule {}
