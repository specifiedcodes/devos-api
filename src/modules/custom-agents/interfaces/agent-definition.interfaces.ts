export interface AgentDefinitionValidationResult {
  valid: boolean;
  errors: AgentDefinitionValidationError[];
  warnings: AgentDefinitionValidationWarning[];
}

export interface AgentDefinitionValidationError {
  path: string;
  message: string;
  keyword: string;
  params?: Record<string, unknown>;
}

export interface AgentDefinitionValidationWarning {
  path: string;
  message: string;
  type: 'deprecation' | 'recommendation' | 'limit';
}

export interface AgentDefinitionListResult {
  items: AgentDefinitionResponseItem[];
  total: number;
  page: number;
  limit: number;
}

export interface AgentDefinitionResponseItem {
  id: string;
  workspaceId: string;
  name: string;
  displayName: string;
  description: string | null;
  version: string;
  schemaVersion: string;
  definition: Record<string, unknown>;
  icon: string;
  category: string;
  tags: string[];
  isPublished: boolean;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ToolReference {
  category: string;
  name: string;
  fullName: string;
}

export interface ParsedToolPermission {
  category: string;
  name: string;
  isWildcard: boolean;
}
