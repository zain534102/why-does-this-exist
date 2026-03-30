export interface AppConfig {
  name: string;
  verbose: boolean;
  maxTokenBudget: number;
  charsPerToken: number;
  maxDiffLines: number;
  maxLinkedIssues: number;
}

export function loadAppConfig(): AppConfig {
  return {
    name: 'wde',
    verbose: process.env.WDE_VERBOSE === 'true',
    maxTokenBudget: parseInt(process.env.WDE_MAX_TOKENS ?? '8000', 10),
    charsPerToken: parseInt(process.env.WDE_CHARS_PER_TOKEN ?? '4', 10),
    maxDiffLines: parseInt(process.env.WDE_MAX_DIFF_LINES ?? '150', 10),
    maxLinkedIssues: parseInt(process.env.WDE_MAX_LINKED_ISSUES ?? '3', 10),
  };
}
