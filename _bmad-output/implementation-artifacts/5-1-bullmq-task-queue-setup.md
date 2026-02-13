# Story 5.1: BullMQ Task Queue Setup

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **system**,
I want a task queue for agent orchestration,
so that agent tasks run asynchronously.

## Acceptance Criteria

**Given** agents perform long-running operations
**When** setting up orchestration infrastructure
**Then** configure BullMQ:
- Redis connection for queue storage
- Queue: `agent-tasks`
- Workers process jobs concurrently (10 workers)
- Job retries: 3 attempts with exponential backoff

**And** job types:
- `spawn-agent`: Create new agent
- `execute-task`: Run agent on specific story
- `recover-context`: Reload agent state after compression
- `terminate-agent`: Clean shutdown

**And** job data structure:
```typescript
{
  job_id: UUID,
  type: string,
  workspace_id: UUID,
  project_id: UUID,
  agent_type: ENUM ('planner', 'dev', 'qa', 'devops'),
  task_data: JSONB,
  priority: INTEGER,
  created_at: TIMESTAMP
}
```

**And** job processing:
- Workers pull jobs from queue
- Execute agent logic
- Update job status (queued → active → completed/failed)
- Store results in database

## Tasks / Subtasks

- [ ] Task 1: Install and configure BullMQ dependencies (AC: Dependencies)
  - [ ] Subtask 1.1: Add BullMQ and @nestjs/bull packages
  - [ ] Subtask 1.2: Configure Bull module with Redis connection
  - [ ] Subtask 1.3: Add BullBoard for queue monitoring UI

- [ ] Task 2: Create agent-tasks queue module (AC: Queue Configuration)
  - [ ] Subtask 2.1: Create agent-tasks module with queue registration
  - [ ] Subtask 2.2: Define queue options (retries, backoff, concurrency)
  - [ ] Subtask 2.3: Export queue for injection in other modules

- [ ] Task 3: Define job type interfaces and DTOs (AC: Job Data Structure)
  - [ ] Subtask 3.1: Create AgentJobData interface with all job types
  - [ ] Subtask 3.2: Create DTOs for each job type (spawn, execute, recover, terminate)
  - [ ] Subtask 3.3: Add validation decorators for job data

- [ ] Task 4: Implement job processor with worker configuration (AC: Job Processing)
  - [ ] Subtask 4.1: Create AgentTaskProcessor with @Process decorator
  - [ ] Subtask 4.2: Configure 10 concurrent workers
  - [ ] Subtask 4.3: Implement job handlers for each job type (stub implementations)
  - [ ] Subtask 4.4: Add job completion/failure logging

- [ ] Task 5: Create database entity for job tracking (AC: Job Status)
  - [ ] Subtask 5.1: Create agent_jobs table migration
  - [ ] Subtask 5.2: Create AgentJob entity with TypeORM
  - [ ] Subtask 5.3: Add indexes for workspace_id, project_id, status queries

- [ ] Task 6: Implement job service for queue management (AC: All)
  - [ ] Subtask 6.1: Create AgentJobsService with queue injection
  - [ ] Subtask 6.2: Implement addJob() method
  - [ ] Subtask 6.3: Implement getJobStatus() method
  - [ ] Subtask 6.4: Implement cancelJob() method

- [ ] Task 7: Write comprehensive unit tests (AC: All)
  - [ ] Subtask 7.1: Test job creation and queueing
  - [ ] Subtask 7.2: Test job processing with mock handlers
  - [ ] Subtask 7.3: Test retry logic and exponential backoff
  - [ ] Subtask 7.4: Test job failure scenarios

- [ ] Task 8: Add API endpoints for job management (AC: Job Status)
  - [ ] Subtask 8.1: Create AgentJobsController
  - [ ] Subtask 8.2: Add POST /api/agent-jobs endpoint
  - [ ] Subtask 8.3: Add GET /api/agent-jobs/:id endpoint
  - [ ] Subtask 8.4: Add DELETE /api/agent-jobs/:id endpoint

- [ ] Task 9: Configure BullBoard monitoring dashboard (AC: Monitoring)
  - [ ] Subtask 9.1: Set up BullBoard Express adapter
  - [ ] Subtask 9.2: Register agent-tasks queue with BullBoard
  - [ ] Subtask 9.3: Mount dashboard at /admin/queues (protected route)

- [ ] Task 10: Write integration tests and update documentation (AC: All)
  - [ ] Subtask 10.1: Write E2E tests for job lifecycle
  - [ ] Subtask 10.2: Test concurrent job processing
  - [ ] Subtask 10.3: Update README with BullMQ setup instructions

## Dev Notes

### Architecture Context

**Epic Goal:** Build autonomous AI agent orchestration system for DevOS that enables specialized agents (Planner, Dev, QA, DevOps) to work autonomously, maintain context across sessions, and execute complete BMAD workflows.

**Story Foundation:** This story establishes the task queue infrastructure using BullMQ (Redis-backed queue) that will manage asynchronous agent tasks, retries, and failure handling. This is the foundation for all subsequent agent stories (5-2 through 5-10).

### Technical Requirements

**Technology Stack:**
- **BullMQ**: Modern Node.js queue library based on Redis (successor to Bull)
- **Redis**: Already configured in project (ioredis@5.9.2)
- **NestJS Integration**: @nestjs/bull for dependency injection
- **BullBoard**: Queue monitoring UI dashboard

**Key Dependencies:**
```json
{
  "bullmq": "^5.x",
  "@nestjs/bull": "^10.x",
  "@bull-board/api": "^6.x",
  "@bull-board/express": "^6.x"
}
```

### Architecture Compliance

**NestJS Module Pattern:**
- Follow established NestJS module structure in `src/modules/`
- Create new `src/modules/agent-jobs/` directory
- Include: module, service, controller, processor, entities, dto
- Register in `src/app.module.ts`

**Database Integration:**
- Use TypeORM for agent_jobs entity (follows existing pattern)
- Create migration in `src/database/migrations/`
- Migration naming: `{timestamp}-CreateAgentJobsTable.ts`

**Multi-Tenancy & Workspace Isolation:**
- CRITICAL: All job data MUST include workspace_id
- Enforce workspace isolation in job queries
- Use Row-Level Security (RLS) on agent_jobs table (see Story 3-7 pattern)

**Redis Configuration:**
- Reuse existing Redis module from `src/modules/redis/`
- Redis connection already configured via ioredis
- Queue name: `agent-tasks`
- Use separate Redis database index for queues (e.g., db: 1)

### Library & Framework Requirements

**BullMQ Version:** Use latest stable 5.x
- Modern replacement for Bull with better TypeScript support
- Better flow control and concurrency handling
- Built-in support for priority queues

**Queue Configuration Best Practices:**
```typescript
// Queue options
{
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000 // 2s, 4s, 8s
    },
    removeOnComplete: 100, // Keep last 100 completed
    removeOnFail: 500 // Keep last 500 failed for debugging
  }
}

// Worker options
{
  concurrency: 10, // Process 10 jobs simultaneously
  lockDuration: 300000, // 5 min lock for long-running agents
  maxStalledCount: 1 // Retry once if stalled
}
```

**Job Priority Levels:**
- CRITICAL: 1 (context recovery, agent failures)
- HIGH: 2 (user-initiated agent tasks)
- NORMAL: 3 (scheduled tasks)
- LOW: 4 (background cleanup)

### File Structure Requirements

```
src/modules/agent-jobs/
├── agent-jobs.module.ts
├── services/
│   ├── agent-jobs.service.ts
│   └── agent-jobs.service.spec.ts
├── processors/
│   ├── agent-task.processor.ts
│   └── agent-task.processor.spec.ts
├── controllers/
│   ├── agent-jobs.controller.ts
│   └── agent-jobs.controller.spec.ts
├── dto/
│   ├── create-agent-job.dto.ts
│   ├── agent-job-response.dto.ts
│   └── job-data.interface.ts
├── entities/
│   └── agent-job.entity.ts
└── enums/
    ├── agent-type.enum.ts
    └── job-type.enum.ts

src/database/migrations/
└── {timestamp}-CreateAgentJobsTable.ts
```

### Testing Requirements

**Unit Test Coverage:**
- All service methods (addJob, getJobStatus, cancelJob)
- Job processor handlers for each job type
- Retry logic and exponential backoff behavior
- Error handling and failure scenarios

**Test Strategy:**
- Mock BullMQ Queue and Job classes
- Use in-memory Redis for integration tests (ioredis-mock)
- Test concurrent job processing with multiple workers
- Verify workspace isolation in job queries

**E2E Test Scenarios:**
1. Create job → verify queued in Redis
2. Process job → verify status updates
3. Job failure → verify retry attempts
4. Job cancellation → verify cleanup
5. Concurrent processing → verify 10 workers active

**Test Coverage Target:** ≥80% (per NFR-M1)

### Project Structure Notes

**Alignment with DevOS Architecture:**

1. **Polyrepo Structure:** This is backend API (`devos-api`), separate from frontend
2. **Module Organization:** Follows NestJS module-per-feature pattern
3. **Database Migrations:** Use TypeORM migrations (existing pattern)
4. **Redis Integration:** Leverage existing Redis module setup
5. **Authentication:** Queue endpoints require JWT auth (use existing guards)

**Integration Points:**
- Story 5.2 (Agent Entity): Will consume this queue for agent lifecycle
- Story 5.3 (Dev Agent): Will add jobs to this queue
- Story 5.8 (Super Orchestrator): Will manage job workflows

### References

**Source Documentation:**
- [Epic 5: Autonomous AI Agent Orchestration](/Users/rajatpratapsingh/Desktop/devos/_bmad-output/planning-artifacts/epics/epic-5-autonomous-ai-agent-orchestration.md#story-51-bullmq-task-queue-setup)
- [Architecture: Task Queue System](/Users/rajatpratapsingh/Desktop/devos/_bmad-output/planning-artifacts/architecture.md#component-breakdown) - Component #6
- [Architecture: Cross-Cutting Concerns](/Users/rajatpratapsingh/Desktop/devos/_bmad-output/planning-artifacts/architecture.md#cross-cutting-concerns-identified)

**Related Stories:**
- Story 3-7: Per-Workspace Cost Isolation (RLS pattern for workspace isolation)
- Story 5.2: Agent Entity & Lifecycle Management (next story, depends on this queue)

**External Documentation:**
- BullMQ Official Docs: https://docs.bullmq.io/
- NestJS Bull Integration: https://docs.nestjs.com/techniques/queues
- BullBoard Monitoring: https://github.com/felixmosh/bull-board

### Security Considerations

1. **Workspace Isolation:** Every job MUST have workspace_id validated
2. **API Key Protection:** Never log BYOK keys in job data or logs
3. **Queue Authentication:** Secure BullBoard dashboard with admin role guard
4. **Job Data Validation:** Validate all job input data with class-validator
5. **Rate Limiting:** Apply rate limits to job creation endpoints

### Performance Considerations

1. **Concurrency:** Start with 10 workers, monitor CPU/memory usage
2. **Job Retention:** Auto-remove old completed jobs (keep last 100)
3. **Redis Memory:** Monitor queue size, alert if >10,000 pending jobs
4. **Database Indexes:** Index workspace_id, project_id, status for fast queries
5. **Backoff Strategy:** Exponential backoff prevents Redis overload on failures

### Environment Variables Required

```bash
# Redis configuration (already exists)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<optional>
REDIS_DB_QUEUE=1  # Separate database for queues

# BullBoard dashboard
BULLBOARD_USERNAME=admin
BULLBOARD_PASSWORD=<secure-password>
```

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

- To be populated during implementation

### Completion Notes List

- To be populated during implementation

### File List

- To be populated during implementation
