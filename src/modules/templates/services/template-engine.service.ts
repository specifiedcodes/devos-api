/**
 * TemplateEngineService
 *
 * Story 19-3: Parameterized Scaffolding
 *
 * Template syntax engine supporting Handlebars-style syntax:
 * - Variable substitution: {{variable}}
 * - Nested access: {{object.property}}
 * - Default values: {{variable|default:value}}
 * - Transformations: {{variable|pascalCase}}, {{variable|kebabCase}}, etc.
 * - Conditionals: {{#if variable}}...{{/if}}, {{#unless variable}}...{{/unless}}
 * - Iterations: {{#each array}}...{{this}}...{{@index}}...{{/each}}
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';

/**
 * Options for template rendering
 */
export interface TemplateEngineOptions {
  // Delimiters (default: ['{{', '}}'])
  delimiters?: [string, string];
  // Conditional delimiters (default: ['{{#', '}}'])
  conditionalDelimiters?: [string, string];
  // Whether to preserve unresolved variables
  preserveUnresolved?: boolean;
  // Custom helpers/functions
  helpers?: Record<string, (value: unknown, ...args: unknown[]) => string>;
}

/**
 * Source file to be processed
 */
export interface SourceFile {
  path: string;
  content: string;
  encoding?: string;
}

/**
 * Processed file result
 */
export interface ProcessedFile {
  path: string;
  content: string;
  encoding?: string;
  size: number;
}

/**
 * Built-in string transformation helpers
 */
const BUILTIN_HELPERS: Record<string, (value: unknown, ...args: unknown[]) => string> = {
  pascalCase: (value: unknown): string => {
    const str = String(value ?? '');
    return str
      .split(/[-_\s]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  },

  camelCase: (value: unknown): string => {
    const str = String(value ?? '');
    const parts = str.split(/[-_\s]+/);
    if (parts.length === 0) return '';
    return (
      parts[0].toLowerCase() +
      parts
        .slice(1)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('')
    );
  },

  kebabCase: (value: unknown): string => {
    const str = String(value ?? '');
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[\s_]+/g, '-');
  },

  snakeCase: (value: unknown): string => {
    const str = String(value ?? '');
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
  },

  upperCase: (value: unknown): string => {
    return String(value ?? '').toUpperCase();
  },

  lowerCase: (value: unknown): string => {
    return String(value ?? '').toLowerCase();
  },

  capitalize: (value: unknown): string => {
    const str = String(value ?? '');
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  default: (value: unknown, defaultValue: unknown): string => {
    if (value === undefined || value === null || value === '') {
      return String(defaultValue ?? '');
    }
    return String(value);
  },
};

/**
 * Binary file signatures for detection
 */
const BINARY_SIGNATURES = [
  '\x00', // Null bytes
  '\xFF\xD8\xFF', // JPEG
  '\x89PNG', // PNG
  'GIF8', // GIF
  '\x50\x4B\x03\x04', // ZIP
];

/**
 * Maximum template size to process (10MB)
 */
const MAX_TEMPLATE_SIZE = 10 * 1024 * 1024;

/**
 * Maximum number of variables to process
 */
const MAX_VARIABLES = 1000;

@Injectable()
export class TemplateEngineService {
  private readonly logger = new Logger(TemplateEngineService.name);
  private customHelpers: Record<string, (value: unknown, ...args: unknown[]) => string> = {};

  /**
   * Compile and render a template string with variables.
   * Includes input validation to prevent ReDoS attacks.
   */
  render(
    template: string,
    variables: Record<string, unknown>,
    options?: TemplateEngineOptions,
  ): string {
    if (!template) return template;

    // Input validation to prevent ReDoS
    if (template.length > MAX_TEMPLATE_SIZE) {
      throw new BadRequestException(`Template exceeds maximum size of ${MAX_TEMPLATE_SIZE} bytes`);
    }

    // Validate number of variables to prevent resource exhaustion
    if (Object.keys(variables).length > MAX_VARIABLES) {
      throw new BadRequestException(`Too many variables (max ${MAX_VARIABLES})`);
    }

    const delimiters = options?.delimiters ?? ['{{', '}}'];
    const preserveUnresolved = options?.preserveUnresolved ?? true;
    const helpers = { ...BUILTIN_HELPERS, ...this.customHelpers, ...options?.helpers };

    let result = template;

    // Process conditionals first ({{#if}}, {{#unless}})
    result = this.processConditionals(result, variables, delimiters);

    // Process iterations ({{#each}})
    result = this.processIterations(result, variables, delimiters);

    // Process variable substitutions ({{variable}}, {{nested.prop}}, {{var|helper}})
    result = this.processVariables(result, variables, delimiters, helpers, preserveUnresolved);

    return result;
  }

  /**
   * Render a file with variable substitution.
   */
  renderFile(file: SourceFile, variables: Record<string, unknown>): ProcessedFile {
    // Process content
    const content = this.render(file.content, variables);

    // Process filename (replace variables in path)
    const path = this.render(file.path, variables);

    return {
      path,
      content,
      encoding: file.encoding,
      size: Buffer.byteLength(content, 'utf-8'),
    };
  }

  /**
   * Check if a file should be skipped based on binary detection.
   */
  shouldSkipFile(content: string, _variables: Record<string, unknown>): boolean {
    // Check for binary signatures
    for (const sig of BINARY_SIGNATURES) {
      if (content.startsWith(sig)) {
        return true;
      }
    }

    // Check for high ratio of non-printable characters
    let nonPrintableCount = 0;
    const sampleSize = Math.min(content.length, 8192);
    const sample = content.slice(0, sampleSize);

    for (let i = 0; i < sample.length; i++) {
      const code = sample.charCodeAt(i);
      // Null bytes or control characters (except common whitespace)
      if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
        nonPrintableCount++;
      }
    }

    // If more than 10% non-printable, consider it binary
    return nonPrintableCount / sampleSize > 0.1;
  }

  /**
   * Extract variable references from a template.
   */
  extractVariables(template: string): string[] {
    const variables: Set<string> = new Set();

    // Match {{variable}} patterns (not starting with # or /)
    const varRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_._-]*)(\|[^}]+)?\}\}/g;
    let match;
    while ((match = varRegex.exec(template)) !== null) {
      // Extract the base variable name (before any transformation)
      const varName = match[1];
      if (!varName.startsWith('#') && !varName.startsWith('/')) {
        variables.add(varName);
      }
    }

    return Array.from(variables);
  }

  /**
   * Register a custom helper function.
   */
  registerHelper(name: string, fn: (value: unknown, ...args: unknown[]) => string): void {
    this.customHelpers[name] = fn;
    this.logger.debug(`Registered custom helper: ${name}`);
  }

  /**
   * Process conditionals ({{#if}}, {{#unless}}, {{else}})
   * Handles nested conditionals by processing from innermost to outermost
   * Includes iteration limit to prevent infinite loops
   */
  private processConditionals(
    template: string,
    variables: Record<string, unknown>,
    delimiters: [string, string],
  ): string {
    let result = template;
    let previousResult = '';
    let iterations = 0;

    // Keep processing until no more changes (handles nested conditionals)
    // with a maximum iteration limit to prevent infinite loops
    while (result !== previousResult && iterations < TemplateEngineService.MAX_CONDITIONAL_ITERATIONS) {
      previousResult = result;
      iterations++;

      // Process {{#if}}...{{else}}...{{/if}} blocks (non-greedy - innermost first)
      const ifElseRegex = /\{\{#if\s+(\S+?)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
      result = result.replace(ifElseRegex, (_, varName, trueContent, falseContent) => {
        const value = this.getNestedValue(variables, varName);
        return this.isTruthy(value) ? trueContent : falseContent;
      });

      // Process {{#if}}...{{/if}} blocks (without else, non-greedy)
      const ifRegex = /\{\{#if\s+(\S+?)\}\}([\s\S]*?)\{\{\/if\}\}/g;
      result = result.replace(ifRegex, (_, varName, content) => {
        const value = this.getNestedValue(variables, varName);
        return this.isTruthy(value) ? content : '';
      });

      // Process {{#unless}}...{{/unless}} blocks (non-greedy)
      const unlessRegex = /\{\{#unless\s+(\S+?)\}\}([\s\S]*?)\{\{\/unless\}\}/g;
      result = result.replace(unlessRegex, (_, varName, content) => {
        const value = this.getNestedValue(variables, varName);
        return this.isTruthy(value) ? '' : content;
      });
    }

    if (iterations >= TemplateEngineService.MAX_CONDITIONAL_ITERATIONS) {
      this.logger.warn(`Conditional processing reached maximum iterations (${TemplateEngineService.MAX_CONDITIONAL_ITERATIONS})`);
    }

    return result;
  }

  /**
   * Process iterations ({{#each}})
   */
  private processIterations(
    template: string,
    variables: Record<string, unknown>,
    delimiters: [string, string],
  ): string {
    const eachRegex = /\{\{#each\s+(\S+?)\}\}([\s\S]*?)\{\{\/each\}\}/g;

    return template.replace(eachRegex, (_, arrayName, content) => {
      const array = this.getNestedValue(variables, arrayName);

      if (!Array.isArray(array) || array.length === 0) {
        return '';
      }

      return array
        .map((item, index) => {
          let itemContent = content;

          // Replace {{this}} with current item
          itemContent = itemContent.replace(/\{\{this\}\}/g, String(item));

          // Replace {{@index}} with current index
          itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index));

          // If item is an object, replace {{property}} with item's properties
          if (typeof item === 'object' && item !== null) {
            const propRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
            itemContent = itemContent.replace(propRegex, (match: string, prop: string) => {
              if (prop in item) {
                return String((item as Record<string, unknown>)[prop] ?? '');
              }
              return match;
            });
          }

          return itemContent;
        })
        .join('');
    });
  }

  /**
   * Process variable substitutions ({{variable}}, {{nested.prop}}, {{var|helper}})
   */
  private processVariables(
    template: string,
    variables: Record<string, unknown>,
    delimiters: [string, string],
    helpers: Record<string, (value: unknown, ...args: unknown[]) => string>,
    preserveUnresolved: boolean,
  ): string {
    // Match {{variable}} or {{variable|helper:arg}}
    const varRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_._-]*)(\|([^}]+))?\}\}/g;

    return template.replace(varRegex, (_, varName, _pipe, helperExpr) => {
      let value = this.getNestedValue(variables, varName);

      // Apply helpers if present
      if (helperExpr) {
        // Parse helper chain (e.g., "default:Untitled|pascalCase")
        const helperCalls = helperExpr.split('|').map((h: string) => h.trim());

        for (const helperCall of helperCalls) {
          const [helperName, ...args] = helperCall.split(':');
          const trimmedName = helperName.trim();

          if (helpers[trimmedName]) {
            value = helpers[trimmedName](value, ...args.map((a: string) => a.trim()));
          }
        }
      } else if (value === undefined) {
        // No helper, preserve or empty
        return preserveUnresolved ? `{{${varName}}}` : '';
      }

      // Handle null
      if (value === null) {
        return '';
      }

      // Escape special characters for string output
      if (typeof value === 'string') {
        return this.escapeString(value);
      }

      return String(value);
    });
  }

  /**
   * Dangerous property names that should be blocked to prevent prototype pollution
   */
  private static readonly DANGEROUS_PROPERTIES = new Set([
    '__proto__',
    'constructor',
    'prototype',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
  ]);

  /**
   * Maximum iterations for processing nested conditionals
   */
  private static readonly MAX_CONDITIONAL_ITERATIONS = 100;

  /**
   * Get nested value from object using dot notation
   * Blocks access to dangerous properties to prevent prototype pollution
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      // Block access to dangerous properties to prevent prototype pollution
      if (TemplateEngineService.DANGEROUS_PROPERTIES.has(part)) {
        this.logger.warn(`Blocked access to dangerous property: ${part}`);
        return undefined;
      }

      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Check if a value is truthy for conditionals
   */
  private isTruthy(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.length > 0;
    if (typeof value === 'number') return value !== 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return true;
    return Boolean(value);
  }

  /**
   * Escape special characters in string output
   */
  private escapeString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }
}
