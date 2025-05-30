/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { devices } from 'playwright';

import { sanitizeForFilePath } from './tools/utils';

import type { Config, ToolCapability } from '../config';
import type { BrowserContextOptions, LaunchOptions } from 'playwright';

export type CLIOptions = {
  browser?: string;
  caps?: string;
  cdpEndpoint?: string;
  executablePath?: string;
  headless?: boolean;
  device?: string;
  userDataDir?: string;
  port?: number;
  host?: string;
  vision?: boolean;
  config?: string;
};

const defaultConfig: Config = {
  browser: {
    browserName: 'chromium',
    userDataDir: os.tmpdir(),
    launchOptions: {
      channel: 'chrome',
      headless: os.platform() === 'linux' && !process.env.DISPLAY,
    },
    contextOptions: {
      viewport: null,
    },
  },
};

export async function resolveConfig(cliOptions: CLIOptions): Promise<Config> {
  const config = await loadConfig(cliOptions.config);
  const cliOverrides = await configFromCLIOptions(cliOptions);
  return mergeConfig(defaultConfig, mergeConfig(config, cliOverrides));
}

export async function configFromCLIOptions(cliOptions: CLIOptions): Promise<Config> {
  let browserName: 'chromium' | 'firefox' | 'webkit';
  let channel: string | undefined;
  switch (cliOptions.browser) {
    case 'chrome':
    case 'chrome-beta':
    case 'chrome-canary':
    case 'chrome-dev':
    case 'chromium':
    case 'msedge':
    case 'msedge-beta':
    case 'msedge-canary':
    case 'msedge-dev':
      browserName = 'chromium';
      channel = cliOptions.browser;
      break;
    case 'firefox':
      browserName = 'firefox';
      break;
    case 'webkit':
      browserName = 'webkit';
      break;
    default:
      browserName = 'chromium';
      channel = 'chrome';
  }

  const launchOptions: LaunchOptions = {
    channel,
    executablePath: cliOptions.executablePath,
    headless: cliOptions.headless,
  };

  if (browserName === 'chromium')
    (launchOptions as any).webSocketPort = await findFreePort();

  const contextOptions: BrowserContextOptions | undefined = cliOptions.device ? devices[cliOptions.device] : undefined;

  return {
    browser: {
      browserName,
      userDataDir: cliOptions.userDataDir ?? await createUserDataDir({ browserName, channel }),
      launchOptions,
      contextOptions,
      cdpEndpoint: cliOptions.cdpEndpoint,
    },
    server: {
      port: cliOptions.port,
      host: cliOptions.host,
    },
    capabilities: cliOptions.caps?.split(',').map((c: string) => c.trim() as ToolCapability),
    vision: !!cliOptions.vision,
  };
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function loadConfig(configFile: string | undefined): Promise<Config> {
  if (!configFile)
    return {};

  try {
    return JSON.parse(await fs.promises.readFile(configFile, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to load config file: ${configFile}, ${error}`);
  }
}

async function createUserDataDir(options: { browserName: 'chromium' | 'firefox' | 'webkit', channel: string | undefined }) {
  let cacheDirectory: string;
  if (process.platform === 'linux')
    cacheDirectory = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  else if (process.platform === 'darwin')
    cacheDirectory = path.join(os.homedir(), 'Library', 'Caches');
  else if (process.platform === 'win32')
    cacheDirectory = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  else
    throw new Error('Unsupported platform: ' + process.platform);
  const result = path.join(cacheDirectory, 'ms-playwright', `mcp-${options.channel ?? options.browserName}-profile`);
  await fs.promises.mkdir(result, { recursive: true });
  return result;
}

export async function outputFile(config: Config, name: string): Promise<string> {
  const result = config.outputDir ?? os.tmpdir();
  await fs.promises.mkdir(result, { recursive: true });
  const fileName = sanitizeForFilePath(name);
  return path.join(result, fileName);
}

function mergeConfig(base: Config, overrides: Config): Config {
  const browser: Config['browser'] = {
    ...base.browser,
    ...overrides.browser,
    launchOptions: {
      ...base.browser?.launchOptions,
      ...overrides.browser?.launchOptions,
      ...{ assistantMode: true },
    },
    contextOptions: {
      ...base.browser?.contextOptions,
      ...overrides.browser?.contextOptions,
    },
  };

  return {
    ...base,
    ...overrides,
    browser,
  };
}
