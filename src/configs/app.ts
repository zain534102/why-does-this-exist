export interface AppConfig {
  name: string;
  verbose: boolean;
  maxTokenBudget: number;
  charsPerToken: number;
  maxDiffLines: number;
  maxLinkedIssues: number;
}

function parsePositiveInt(
  value: string | undefined,
  defaultVal: number,
  min: number,
  max: number,
): number {
  const parsed = parseInt(value ?? String(defaultVal), 10);
  if (isNaN(parsed) || parsed < min || parsed > max) {
    return defaultVal;
  }
  return parsed;
}

export function loadAppConfig(): AppConfig {
  return {
    name: 'wde',
    verbose: process.env.WDE_VERBOSE === 'true',
    maxTokenBudget: parsePositiveInt(process.env.WDE_MAX_TOKENS, 8000, 100, 128000),
    charsPerToken: parsePositiveInt(process.env.WDE_CHARS_PER_TOKEN, 4, 1, 10),
    maxDiffLines: parsePositiveInt(process.env.WDE_MAX_DIFF_LINES, 150, 1, 10000),
    maxLinkedIssues: parsePositiveInt(process.env.WDE_MAX_LINKED_ISSUES, 3, 1, 20),
  };
}
