import { type AppConfig, loadAppConfig } from './app';
import { type GitHubConfig, loadGitHubConfig } from './github';

export type { GitHubConfig } from './github';
export type { AppConfig } from './app';

export interface Config {
  github: GitHubConfig;
  app: AppConfig;
}

let configInstance: Config | null = null;
let githubInstance: GitHubConfig | null = null;
let appInstance: AppConfig | null = null;

export function config(): Config {
  if (!configInstance) {
    configInstance = {
      github: github(),
      app: app(),
    };
  }
  return configInstance;
}

export function github(): GitHubConfig {
  if (!githubInstance) {
    githubInstance = loadGitHubConfig();
  }
  return githubInstance;
}

export function app(): AppConfig {
  if (!appInstance) {
    appInstance = loadAppConfig();
  }
  return appInstance;
}

export function reloadConfig(): Config {
  githubInstance = null;
  appInstance = null;
  configInstance = null;
  return config();
}
