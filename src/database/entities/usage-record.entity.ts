import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { IsUUID, IsNotEmpty, IsNumber, IsDateString } from 'class-validator';

@Entity('usage_tracking')
@Index(['workspaceId', 'date'])
@Index(['workspaceId', 'projectId', 'date'])
export class UsageRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  @IsUUID()
  workspaceId!: string;

  @Column({ type: 'uuid', nullable: true, name: 'project_id' })
  @IsUUID()
  projectId?: string;

  @Column({ type: 'uuid', nullable: true, name: 'agent_id' })
  @IsUUID()
  agentId?: string;

  @Column({ type: 'varchar', length: 50 })
  @IsNotEmpty()
  provider!: string;

  @Column({ type: 'varchar', length: 100 })
  @IsNotEmpty()
  model!: string;

  @Column({ type: 'int', name: 'request_count' })
  @IsNumber()
  requestCount!: number;

  @Column({ type: 'bigint', name: 'input_tokens' })
  inputTokens!: string;

  @Column({ type: 'bigint', name: 'output_tokens' })
  outputTokens!: string;

  @Column({ type: 'decimal', precision: 10, scale: 6, name: 'cost_usd' })
  @IsNumber()
  costUSD!: number;

  @Column({ type: 'date' })
  @IsDateString()
  date!: Date;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
