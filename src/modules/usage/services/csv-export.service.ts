import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiUsage } from '../../../database/entities/api-usage.entity';
import { Transform, PassThrough } from 'stream';

/**
 * Escape CSV field according to RFC 4180
 * - Fields containing comma, quote, or newline must be quoted
 * - Quotes within fields must be escaped by doubling them
 */
function escapeCSVField(field: string): string {
  if (
    field.includes(',') ||
    field.includes('"') ||
    field.includes('\n') ||
    field.includes('\r')
  ) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Service for exporting usage data as CSV with streaming support
 * Handles large datasets efficiently without loading all data into memory
 */
@Injectable()
export class CsvExportService {
  private readonly logger = new Logger(CsvExportService.name);

  constructor(
    @InjectRepository(ApiUsage)
    private readonly apiUsageRepository: Repository<ApiUsage>,
  ) {}

  /**
   * Generate a CSV stream for usage data
   * Uses Node.js streams for memory-efficient handling of large datasets
   *
   * @param workspaceId - Workspace ID
   * @param startDate - Start date for filtering
   * @param endDate - End date for filtering
   * @returns Readable stream of CSV data
   */
  async generateCsvStream(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PassThrough> {
    this.logger.log(
      `Generating CSV export for workspace ${workspaceId}, range: ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );

    // Create streaming query
    const queryStream = await this.apiUsageRepository
      .createQueryBuilder('usage')
      .leftJoin('projects', 'project', 'usage.project_id = project.id')
      .select('usage.id', 'id')
      .addSelect('usage.created_at', 'createdAt')
      .addSelect('usage.provider', 'provider')
      .addSelect('usage.model', 'model')
      .addSelect('COALESCE(project.name, NULL)', 'projectName')
      .addSelect('usage.input_tokens', 'inputTokens')
      .addSelect('usage.output_tokens', 'outputTokens')
      .addSelect('usage.cost_usd', 'costUsd')
      .addSelect('usage.agent_id', 'agentId')
      .where('usage.workspace_id = :workspaceId', { workspaceId })
      .andWhere('usage.created_at BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .orderBy('usage.created_at', 'ASC')
      .stream();

    // Create CSV header
    const header =
      'Timestamp,Provider,Model,Project,Input Tokens,Output Tokens,Cost (USD),Agent ID\n';

    // Create transform stream to convert rows to CSV format
    let isFirstRow = true;
    const csvTransform = new Transform({
      objectMode: true,
      transform(row: any, encoding, callback) {
        try {
          // Add header on first row
          if (isFirstRow) {
            this.push(header);
            isFirstRow = false;
          }

          // Format row as CSV
          const csvRow = [
            row.createdAt.toISOString(),
            row.provider,
            row.model,
            row.projectName || 'No Project',
            row.inputTokens,
            row.outputTokens,
            parseFloat(row.costUsd).toFixed(6),
            row.agentId || '',
          ];

          // Escape and quote fields that need it
          const escapedRow = csvRow.map((field) =>
            escapeCSVField(String(field)),
          );

          this.push(escapedRow.join(',') + '\n');
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
    });

    // Create output stream
    const outputStream = new PassThrough();

    // Pipe streams together
    queryStream.pipe(csvTransform).pipe(outputStream);

    // Handle errors
    queryStream.on('error', (error) => {
      this.logger.error('Error in query stream', error);
      outputStream.destroy(error);
    });

    csvTransform.on('error', (error) => {
      this.logger.error('Error in CSV transform stream', error);
      outputStream.destroy(error);
    });

    return outputStream;
  }

  /**
   * Get estimated row count for export
   * Useful for showing progress or warning about large exports
   *
   * @param workspaceId - Workspace ID
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Estimated number of rows
   */
  async getEstimatedRowCount(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const count = await this.apiUsageRepository
      .createQueryBuilder('usage')
      .where('usage.workspace_id = :workspaceId', { workspaceId })
      .andWhere('usage.created_at BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getCount();

    return count;
  }
}
