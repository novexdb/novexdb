import type { StructuredTool } from '@main/services/ai/providers/provider.types'

/**
 * Tool descriptors for the structured AI features. Each tool's input schema is
 * the result shape — forced tool use makes the model return exactly this JSON.
 * Schemas use only structured-output-supported constructs and are strict.
 */

const severity = { type: 'string', enum: ['high', 'medium', 'low'] }
const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] }

function issueArray(): Record<string, unknown> {
  return {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        severity,
        title: { type: 'string' },
        detail: { type: 'string' }
      },
      required: ['severity', 'title', 'detail']
    }
  }
}

export const nl2SqlTool: StructuredTool = {
  name: 'provide_sql',
  description: 'Return the generated SQL query with its explanation and assessment.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sql: { type: 'string', description: 'The PostgreSQL query.' },
      explanation: { type: 'string', description: 'Plain-English explanation of the query.' },
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Safety or correctness warnings; empty array if none.'
      },
      confidence: { type: 'number', description: 'Confidence from 0 to 1.' }
    },
    required: ['sql', 'explanation', 'warnings', 'confidence']
  }
}

export const explainTool: StructuredTool = {
  name: 'provide_explanation',
  description: 'Return a plain-English explanation of a SQL query.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: { type: 'string', description: 'One-paragraph summary of the query.' },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            detail: { type: 'string' }
          },
          required: ['title', 'detail']
        }
      }
    },
    required: ['summary', 'steps']
  }
}

export const optimizeTool: StructuredTool = {
  name: 'provide_optimization',
  description: 'Return a performance analysis of a SQL query.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      issues: issueArray(),
      suggestedSql: {
        ...nullableString,
        description: 'An optimized rewrite of the query, or null if none helps.'
      },
      missingIndexes: {
        type: 'array',
        items: { type: 'string' },
        description: 'CREATE INDEX statements for suggested indexes.'
      },
      reasoning: { type: 'string' }
    },
    required: ['issues', 'suggestedSql', 'missingIndexes', 'reasoning']
  }
}

export const errorExplainTool: StructuredTool = {
  name: 'provide_error_fix',
  description: 'Return an explanation and fix for a SQL error.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      explanation: { type: 'string' },
      fix: { type: 'string' },
      correctedSql: {
        ...nullableString,
        description: 'A corrected version of the query, or null if not possible.'
      }
    },
    required: ['explanation', 'fix', 'correctedSql']
  }
}

export const analysisTool: StructuredTool = {
  name: 'provide_analysis',
  description: 'Return a structured review of the database schema.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      overview: { type: 'string' },
      issues: issueArray(),
      recommendations: { type: 'array', items: { type: 'string' } }
    },
    required: ['overview', 'issues', 'recommendations']
  }
}
