import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ExportFormat, ExportType } from '../dto/export.dto';
import { VelocityMetricsService } from '../../sprints/services/velocity-metrics.service';
import { SprintMetricsService } from '../../sprints/services/sprint-metrics.service';
import { AgentPerformanceService } from './agent-performance.service';
import { CostAnalyticsService } from './cost-analytics.service';
import { CumulativeFlowService } from './cumulative-flow.service';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly velocityMetricsService: VelocityMetricsService,
    private readonly sprintMetricsService: SprintMetricsService,
    private readonly agentPerformanceService: AgentPerformanceService,
    private readonly costAnalyticsService: CostAnalyticsService,
    private readonly cumulativeFlowService: CumulativeFlowService,
  ) {}

  async exportData(
    workspaceId: string,
    projectId: string,
    type: ExportType,
    format: ExportFormat,
    dateFrom?: string,
    dateTo?: string,
    filters?: Record<string, any>,
  ): Promise<{ data: Buffer; filename: string; mimeType: string }> {
    this.logger.log(`Exporting ${type} data as ${format}`);

    const data = await this.fetchData(workspaceId, projectId, type, dateFrom, dateTo, filters);

    const timestamp = new Date().toISOString().split('T')[0];
    const extension = format === ExportFormat.CSV ? 'csv' : 'html';

    if (format === ExportFormat.CSV) {
      const csv = this.convertToCsv(data, type);
      return {
        data: Buffer.from(csv, 'utf-8'),
        filename: `analytics-${type}-${timestamp}.${extension}`,
        mimeType: 'text/csv',
      };
    } else {
      const html = this.convertToHtml(data, type, dateFrom, dateTo);
      return {
        data: Buffer.from(html, 'utf-8'),
        filename: `analytics-${type}-${timestamp}.${extension}`,
        mimeType: 'text/html',
      };
    }
  }

  private async fetchData(
    workspaceId: string,
    projectId: string,
    type: ExportType,
    dateFrom?: string,
    dateTo?: string,
    filters?: Record<string, any>,
  ): Promise<any> {
    switch (type) {
      case ExportType.VELOCITY:
        return this.velocityMetricsService.getVelocityData(
          workspaceId,
          projectId,
          dateFrom,
          dateTo,
          10,
        );

      case ExportType.BURNDOWN:
        const sprintId = filters?.sprintId;
        if (!sprintId) {
          throw new Error('Sprint ID is required for burndown export');
        }
        return this.sprintMetricsService.getBurndownData(
          workspaceId,
          projectId,
          sprintId,
          dateFrom,
          dateTo,
        );

      case ExportType.AGENT_PERFORMANCE:
        return this.agentPerformanceService.getAgentPerformance(
          workspaceId,
          projectId,
          { date_from: dateFrom, date_to: dateTo },
        );

      case ExportType.COST:
        return this.costAnalyticsService.getCostAnalytics(
          workspaceId,
          projectId,
          { date_from: dateFrom, date_to: dateTo },
        );

      case ExportType.CUMULATIVE_FLOW:
        return this.cumulativeFlowService.getCumulativeFlowData(
          workspaceId,
          projectId,
          { date_from: dateFrom, date_to: dateTo, sprint_id: filters?.sprintId },
        );

      default:
        throw new Error(`Unknown export type: ${type}`);
    }
  }

  private convertToCsv(data: any, type: ExportType): string {
    switch (type) {
      case ExportType.VELOCITY:
        return this.velocityToCsv(data);
      case ExportType.BURNDOWN:
        return this.burndownToCsv(data);
      case ExportType.AGENT_PERFORMANCE:
        return this.agentPerformanceToCsv(data);
      case ExportType.COST:
        return this.costToCsv(data);
      case ExportType.CUMULATIVE_FLOW:
        return this.cumulativeFlowToCsv(data);
      default:
        return '';
    }
  }

  private velocityToCsv(data: any): string {
    const headers = ['Sprint', 'Planned Points', 'Completed Points', 'Completion Rate', 'Start Date', 'End Date'];
    const rows = (data.sprints || []).map((s: any) => [
      s.sprintName,
      s.plannedPoints,
      s.completedPoints,
      `${Math.round(s.completionRate * 100)}%`,
      s.startDate,
      s.endDate,
    ]);

    return this.arrayToCsv([headers, ...rows]);
  }

  private burndownToCsv(data: any): string {
    const headers = ['Date', 'Total Points', 'Completed Points', 'Remaining Points', 'Ideal Remaining', 'Scope Changes'];
    const rows = (data.dataPoints || []).map((dp: any) => [
      dp.date,
      dp.totalPoints,
      dp.completedPoints,
      dp.remainingPoints,
      dp.idealRemaining || 0,
      dp.scopeChanges || 0,
    ]);

    return this.arrayToCsv([headers, ...rows]);
  }

  private agentPerformanceToCsv(data: any): string {
    const headers = ['Agent Name', 'Agent Type', 'Tasks Completed', 'Success Rate', 'Avg Time (hours)', '7-Day Trend'];
    const rows = (data.agents || []).map((a: any) => [
      a.agentName,
      a.agentType,
      a.tasksCompleted,
      `${a.successRate}%`,
      a.avgTimePerTaskHours,
      (a.trendData || []).join(';'),
    ]);

    return this.arrayToCsv([headers, ...rows]);
  }

  private costToCsv(data: any): string {
    const headers = ['Model', 'Cost (USD)', 'Percentage'];
    const rows = (data.byModel || []).map((m: any) => [
      m.model,
      m.cost.toFixed(2),
      `${m.percentage.toFixed(1)}%`,
    ]);

    const summaryRows = [
      ['', '', ''],
      ['Total Cost', data.totalCost?.toFixed(2) || '0.00', ''],
      ['Projected Monthly', data.projectedMonthlyCost?.toFixed(2) || '0.00', ''],
    ];

    return this.arrayToCsv([headers, ...rows, ...summaryRows]);
  }

  private cumulativeFlowToCsv(data: any): string {
    const headers = ['Date', 'Backlog', 'In Progress', 'Review', 'Done'];
    const rows = (data.dataPoints || []).map((dp: any) => [
      dp.date,
      dp.backlog,
      dp.inProgress,
      dp.review,
      dp.done,
    ]);

    return this.arrayToCsv([headers, ...rows]);
  }

  private arrayToCsv(rows: any[][]): string {
    return rows
      .map(row => row.map(cell => this.escapeCsvCell(cell)).join(','))
      .join('\n');
  }

  private escapeCsvCell(cell: any): string {
    if (cell === null || cell === undefined) {
      return '';
    }
    const str = String(cell);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || /^[=+\-@]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  private escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private convertToHtml(data: any, type: ExportType, dateFrom?: string, dateTo?: string): string {
    const titles: Record<ExportType, string> = {
      [ExportType.VELOCITY]: 'Velocity Report',
      [ExportType.BURNDOWN]: 'Sprint Burndown Report',
      [ExportType.AGENT_PERFORMANCE]: 'Agent Performance Report',
      [ExportType.COST]: 'Cost Analytics Report',
      [ExportType.CUMULATIVE_FLOW]: 'Cumulative Flow Report',
    };

    const title = titles[type];
    const tables = this.generateHtmlTables(data, type);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
    h1 { color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
    .meta { color: #6b7280; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    th { background-color: #f9fafb; font-weight: 600; }
    tr:nth-child(even) { background-color: #f9fafb; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">
    Period: ${dateFrom || 'N/A'} to ${dateTo || 'N/A'}<br>
    Generated: ${new Date().toISOString()}
  </div>
  ${tables}
  <div class="footer">Generated by DevOS Analytics</div>
</body>
</html>
    `.trim();
  }

  private generateHtmlTables(data: any, type: ExportType): string {
    switch (type) {
      case ExportType.VELOCITY:
        return this.velocityToHtml(data);
      case ExportType.BURNDOWN:
        return this.burndownToHtml(data);
      case ExportType.AGENT_PERFORMANCE:
        return this.agentPerformanceToHtml(data);
      case ExportType.COST:
        return this.costToHtml(data);
      case ExportType.CUMULATIVE_FLOW:
        return this.cumulativeFlowToHtml(data);
      default:
        return '<p>No data available</p>';
    }
  }

  private velocityToHtml(data: any): string {
    const avgVelocity = data.averageVelocity || 0;
    const rows = (data.sprints || []).map((s: any) => `
      <tr>
        <td>${this.escapeHtml(s.sprintName)}</td>
        <td>${s.plannedPoints}</td>
        <td>${s.completedPoints}</td>
        <td>${Math.round(s.completionRate * 100)}%</td>
      </tr>
    `).join('');

    return `
      <p><strong>Average Velocity:</strong> ${avgVelocity.toFixed(1)} points/sprint</p>
      <table>
        <thead><tr><th>Sprint</th><th>Planned</th><th>Completed</th><th>Rate</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  private burndownToHtml(data: any): string {
    const rows = (data.dataPoints || []).slice(-14).map((dp: any) => `
      <tr>
        <td>${dp.date}</td>
        <td>${dp.totalPoints}</td>
        <td>${dp.completedPoints}</td>
        <td>${dp.remainingPoints}</td>
        <td>${dp.idealRemaining || 0}</td>
      </tr>
    `).join('');

    return `
      <p><strong>Sprint:</strong> ${this.escapeHtml(data.sprintName || 'N/A')}</p>
      <table>
        <thead><tr><th>Date</th><th>Total</th><th>Completed</th><th>Remaining</th><th>Ideal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  private agentPerformanceToHtml(data: any): string {
    const rows = (data.agents || []).map((a: any) => `
      <tr>
        <td>${this.escapeHtml(a.agentName)}</td>
        <td>${this.escapeHtml(a.agentType)}</td>
        <td>${a.tasksCompleted}</td>
        <td>${a.successRate}%</td>
        <td>${a.avgTimePerTaskHours.toFixed(1)}h</td>
      </tr>
    `).join('');

    return `
      <table>
        <thead><tr><th>Agent</th><th>Type</th><th>Tasks</th><th>Success</th><th>Avg Time</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  private costToHtml(data: any): string {
    const modelRows = (data.byModel || []).map((m: any) => `
      <tr>
        <td>${this.escapeHtml(m.model)}</td>
        <td>$${m.cost.toFixed(2)}</td>
        <td>${m.percentage.toFixed(1)}%</td>
      </tr>
    `).join('');

    return `
      <p><strong>Total Cost:</strong> $${(data.totalCost || 0).toFixed(2)}</p>
      <p><strong>Projected Monthly:</strong> $${(data.projectedMonthlyCost || 0).toFixed(2)}</p>
      <table>
        <thead><tr><th>Model</th><th>Cost</th><th>%</th></tr></thead>
        <tbody>${modelRows}</tbody>
      </table>
      <h3>Recommendations</h3>
      <ul>
        ${(data.recommendations || []).map((r: string) => `<li>${this.escapeHtml(r)}</li>`).join('')}
      </ul>
    `;
  }

  private cumulativeFlowToHtml(data: any): string {
    const rows = (data.dataPoints || []).slice(-14).map((dp: any) => `
      <tr>
        <td>${dp.date}</td>
        <td>${dp.backlog}</td>
        <td>${dp.inProgress}</td>
        <td>${dp.review}</td>
        <td>${dp.done}</td>
      </tr>
    `).join('');

    const bottleneckRows = (data.bottlenecks || []).map((b: any) => `
      <tr>
        <td>${b.status}</td>
        <td>${b.avgTimeInStatus}h</td>
        <td>${b.queueSize}</td>
        <td>${b.isBottleneck ? 'Yes' : 'No'}</td>
      </tr>
    `).join('');

    return `
      <p><strong>Total Stories:</strong> ${data.totalStories || 0}</p>
      <h3>Flow Data</h3>
      <table>
        <thead><tr><th>Date</th><th>Backlog</th><th>In Progress</th><th>Review</th><th>Done</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <h3>Bottleneck Analysis</h3>
      <table>
        <thead><tr><th>Status</th><th>Avg Time</th><th>Queue</th><th>Bottleneck</th></tr></thead>
        <tbody>${bottleneckRows}</tbody>
      </table>
    `;
  }
}
