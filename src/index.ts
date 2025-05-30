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

import { createServerWithTools } from './server';
import common from './tools/common';
import console from './tools/console';
import dialogs from './tools/dialogs';
import files from './tools/files';
import install from './tools/install';
import keyboard from './tools/keyboard';
import navigate from './tools/navigate';
import network from './tools/network';
import pdf from './tools/pdf';
import snapshot from './tools/snapshot';
import tabs from './tools/tabs';
import screen from './tools/screen';

import type { Tool } from './tools/tool';
import type { Config } from '../config';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

const snapshotTools: Tool<any>[] = [
  ...common(true),
  ...console,
  ...dialogs(true),
  ...files(true),
  ...install,
  ...keyboard(true),
  ...navigate(true),
  ...network,
  ...pdf,
  ...snapshot,
  ...tabs(true),
];

const screenshotTools: Tool<any>[] = [
  ...common(false),
  ...console,
  ...dialogs(false),
  ...files(false),
  ...install,
  ...keyboard(false),
  ...navigate(false),
  ...network,
  ...pdf,
  ...screen,
  ...tabs(false),
];

const packageJSON = require('../package.json');

export async function createServer(config: Config = {}): Promise<Server> {
  const allTools = config.vision ? screenshotTools : snapshotTools;
  const tools = allTools.filter(tool => !config.capabilities || tool.capability === 'core' || config.capabilities.includes(tool.capability));
  return createServerWithTools({
    name: 'Playwright',
    version: packageJSON.version,
    tools,
  }, config);
}
