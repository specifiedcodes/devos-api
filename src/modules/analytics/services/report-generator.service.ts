import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ScheduledReport } from '../../../database/entities/scheduled-report.entity';
import { AgentPerformanceService } from './agent-performance.service';
import { CostAnalyticsService } from './cost-analytics.service';
import { SprintMetricsService } from '../../sprints/services/sprint-metrics.service';
import { VelocityMetricsService } from '../../sprints/services/velocity-metrics.service';

export interface ReportSection {
  title: string;
  type: string;
  data: any;
}

@Injectable()
export class ReportGeneratorService {
  private readonly logger = new Logger(ReportGeneratorService.name);

  constructor(
    private readonly agentPerformanceService: AgentPerformanceService,
    private readonly costAnalyticsService: CostAnalyticsService,
    private readonly sprintMetricsService: SprintMetricsService,
    private readonly velocityMetricsService: VelocityMetricsService,
  ) {}

  async generateReport(report: ScheduledReport): Promise<Buffer> {
    this.logger.log(`Generating report: ${report.name}`);

    const sections: ReportSection[] = [];
    const filters = report.filters || {};
    const dateFrom = filters.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dateTo = filters.dateTo || new Date().toISOString().split('T')[0];

    for (const sectionType of report.sections) {
      try {
        const section = await this.generateSection(
          sectionType,
          report.workspaceId,
          filters.projectId || '',
          dateFrom,
          dateTo,
          filters,
        );
        if (section) {
          sections.push(section);
        }
      } catch (error) {
        this.logger.error(`Failed to generate section ${sectionType}:`, error);
      }
    }

    return this.renderPdfReport(report.name, sections, dateFrom, dateTo);
  }

  private async generateSection(
    type: string,
    workspaceId: string,
    projectId: string,
    dateFrom: string,
    dateTo: string,
    filters: Record<string, any>,
  ): Promise<ReportSection | null> {
    switch (type) {
      case 'velocity':
        if (!projectId) return null;
        const velocityData = await this.velocityMetricsService.getVelocityData(
          workspaceId,
          projectId,
          dateFrom,
          dateTo,
          10,
        );
        return {
          title: 'Velocity',
          type: 'velocity',
          data: velocityData,
        };

      case 'burndown':
        if (!projectId || !filters.sprintId) return null;
        const burndownData = await this.sprintMetricsService.getBurndownData(
          workspaceId,
          projectId,
          filters.sprintId,
          dateFrom,
          dateTo,
        );
        return {
          title: 'Sprint Burndown',
          type: 'burndown',
          data: burndownData,
        };

      case 'agent-performance':
        const agentData = await this.agentPerformanceService.getAgentPerformance(
          workspaceId,
          projectId,
          { date_from: dateFrom, date_to: dateTo },
        );
        return {
          title: 'Agent Performance',
          type: 'agent-performance',
          data: agentData,
        };

      case 'cost':
        const costData = await this.costAnalyticsService.getCostAnalytics(
          workspaceId,
          projectId,
          { date_from: dateFrom, date_to: dateTo },
        );
        return {
          title: 'Cost Analytics',
          type: 'cost',
          data: costData,
        };

      default:
        this.logger.warn(`Unknown section type: ${type}`);
        return null;
    }
  }

  private renderPdfReport(
    reportName: string,
    sections: ReportSection[],
    dateFrom: string,
    dateTo: string,
  ): Buffer {
    const html = this.generateHtmlReport(reportName, sections, dateFrom, dateTo);

    return Buffer.from(html, 'utf-8');
  }

  private generateHtmlReport(
    reportName: string,
    sections: ReportSection[],
    dateFrom: string,
    dateTo: string,
  ): string {
    const sectionsHtml = sections.map(section => this.renderSection(section)).join('\n');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      color: #111827;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 10px;
    }
    h2 {
      color: #374151;
      margin-top: 30px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 8px;
    }
    .meta {
      color: #6b7280;
      font-size: 14px;
      margin-bottom: 30px;
    }
    .section {
      margin-bottom: 30px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background-color: #f9fafb;
      font-weight: 600;
    }
    tr:nth-child(even) {
      background-color: #f9fafb;
    }
    .metric {
      display: inline-block;
      margin-right: 20px;
      margin-bottom: 10px;
    }
    .metric-value {
      font-size: 24px;
      font-weight: 600;
      color: #3b82f6;
    }
    .metric-label {
      font-size: 12px;
      color: #6b7280;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>${reportName}</h1>
  <div class="meta">
    Report Period: ${dateFrom} to ${dateTo}<br>
    Generated: ${new Date().toISOString()}
  </div>
  ${sectionsHtml}
  <div class="footer">
    Generated by DevOS Analytics
  </div>
</body>
</html>
    `.trim();
  }

  private renderSection(section: ReportSection): string {
    switch (section.type) {
      case 'velocity':
        return this.renderVelocitySection(section);
      case 'burndown':
        return this.renderBurndownSection(section);
      case 'agent-performance':
        return this.renderAgentPerformanceSection(section);
      case 'cost':
        return this.renderCostSection(section);
      default:
        return `<div class="section"><h2>${section.title}</h2><p>Data not available</p></div>`;
    }
  }

  private renderVelocitySection(section: ReportSection): string {
    const data = section.data;
    const avgVelocity = data.averageVelocity || 0;
    const sprints = data.sprints || [];

    const sprintRows = sprints.map((s: any) => `
      <tr>
        <td>${s.sprintName}</td>
        <td>${s.plannedPoints}</td>
        <td>${s.completedPoints}</td>
        <td>${Math.round(s.completionRate * 100)}%</td>
      </tr>
    `).join('\n');

    return `
      <div class="section">
        <h2>Velocity</h2>
        <div class="metric">
          <div class="metric-value">${avgVelocity}</div>
          <div class="metric-label">Avg Points/Sprint</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Sprint</th>
              <th>Planned</th>
              <th>Completed</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            ${sprintRows}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderBurndownSection(section: ReportSection): string {
    const data = section.data;
    const dataPoints = data.dataPoints || [];

    const rows = dataPoints.slice(-7).map((dp: any) => `
      <tr>
        <td>${dp.date}</td>
        <td>${dp.remainingPoints}</td>
        <td>${dp.idealRemaining || 0}</td>
        <td>${dp.completedPoints}</td>
      </tr>
    `).join('\n');

    return `
      <div class="section">
        <h2>Sprint Burndown - ${data.sprintName || 'Current Sprint'}</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Remaining</th>
              <th>Ideal</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderAgentPerformanceSection(section: ReportSection): string {
    const agents = section.data.agents || [];

    const rows = agents.map((a: any) => `
      <tr>
        <td>${a.agentName}</td>
        <td>${a.agentType}</td>
        <td>${a.tasksCompleted}</td>
        <td>${a.successRate}%</td>
        <td>${a.avgTimePerTaskHours.toFixed(1)}h</td>
      </tr>
    `).join('\n');

    return `
      <div class="section">
        <h2>Agent Performance</h2>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Type</th>
              <th>Tasks</th>
              <th>Success</th>
              <th>Avg Time</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderCostSection(section: ReportSection): string {
    const data = section.data;
    const totalCost = data.totalCost || 0;
    const projected = data.projectedMonthlyCost || 0;
    const byModel = data.byModel || [];

    const modelRows = byModel.map((m: any) => `
      <tr>
        <td>${m.model}</td>
        <td>$${m.cost.toFixed(2)}</td>
        <td>${m.percentage.toFixed(1)}%</td>
      </tr>
    `).join('\n');

    return `
      <div class="section">
        <h2>Cost Analytics</h2>
        <div class="metric">
          <div class="metric-value">$${totalCost.toFixed(2)}</div>
          <div class="metric-label">Total Cost</div>
        </div>
        <div class="metric">
          <div class="metric-value">$${projected.toFixed(2)}</div>
          <div class="metric-label">Projected Monthly</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Cost</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            ${modelRows}
          </tbody>
        </table>
      </div>
    `;
  }
}
