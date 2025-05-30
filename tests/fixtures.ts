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
import path from 'path';
import { chromium } from 'playwright';

import { test as baseTest, expect as baseExpect } from '@playwright/test';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { spawn } from 'child_process';
import { TestServer } from './testserver';

import type { Config } from '../config';

type TestFixtures = {
  client: Client;
  visionClient: Client;
  startClient: (options?: { args?: string[], config?: Config }) => Promise<Client>;
  wsEndpoint: string;
  cdpEndpoint: string;
  server: TestServer;
  httpsServer: TestServer;
};

type WorkerFixtures = {
  mcpHeadless: boolean;
  mcpBrowser: string | undefined;
  _workerServers: { server: TestServer, httpsServer: TestServer };
};

export const test = baseTest.extend<TestFixtures, WorkerFixtures>({

  client: async ({ startClient }, use) => {
    await use(await startClient());
  },

  visionClient: async ({ startClient }, use) => {
    await use(await startClient({ args: ['--vision'] }));
  },

  startClient: async ({ mcpHeadless, mcpBrowser }, use, testInfo) => {
    const userDataDir = testInfo.outputPath('user-data-dir');
    let client: StdioClientTransport | undefined;

    await use(async options => {
      const args = ['--user-data-dir', userDataDir];
      if (mcpHeadless)
        args.push('--headless');
      if (mcpBrowser)
        args.push(`--browser=${mcpBrowser}`);
      if (options?.args)
        args.push(...options.args);
      if (options?.config) {
        const configFile = testInfo.outputPath('config.json');
        await fs.promises.writeFile(configFile, JSON.stringify(options.config, null, 2));
        args.push(`--config=${configFile}`);
      }
      const transport = new StdioClientTransport({
        command: 'node',
        args: [path.join(__dirname, '../cli.js'), ...args],
      });
      const client = new Client({ name: 'test', version: '1.0.0' });
      await client.connect(transport);
      await client.ping();
      return client;
    });

    await client?.close();
  },

  wsEndpoint: async ({ }, use) => {
    const browserServer = await chromium.launchServer();
    await use(browserServer.wsEndpoint());
    await browserServer.close();
  },

  cdpEndpoint: async ({ }, use, testInfo) => {
    const port = 3200 + (+process.env.TEST_PARALLEL_INDEX!);
    const executablePath = chromium.executablePath();
    const browserProcess = spawn(executablePath, [
      `--user-data-dir=${testInfo.outputPath('user-data-dir')}`,
      `--remote-debugging-port=${port}`,
      `--no-first-run`,
      `--no-sandbox`,
      `--headless`,
      '--use-mock-keychain',
      `data:text/html,hello world`,
    ], {
      stdio: 'pipe',
    });
    await new Promise<void>(resolve => {
      browserProcess.stderr.on('data', data => {
        if (data.toString().includes('DevTools listening on '))
          resolve();
      });
    });
    await use(`http://localhost:${port}`);
    browserProcess.kill();
  },

  mcpHeadless: [async ({ headless }, use) => {
    await use(headless);
  }, { scope: 'worker' }],

  mcpBrowser: ['chrome', { option: true, scope: 'worker' }],

  _workerServers: [async ({}, use, workerInfo) => {
    const port = 8907 + workerInfo.workerIndex * 4;
    const server = await TestServer.create(port);

    const httpsPort = port + 1;
    const httpsServer = await TestServer.createHTTPS(httpsPort);

    await use({ server, httpsServer });

    await Promise.all([
      server.stop(),
      httpsServer.stop(),
    ]);
  }, { scope: 'worker' }],

  server: async ({ _workerServers }, use) => {
    _workerServers.server.reset();
    await use(_workerServers.server);
  },

  httpsServer: async ({ _workerServers }, use) => {
    _workerServers.httpsServer.reset();
    await use(_workerServers.httpsServer);
  },
});

type Response = Awaited<ReturnType<Client['callTool']>>;

export const expect = baseExpect.extend({
  toHaveTextContent(response: Response, content: string | RegExp) {
    const isNot = this.isNot;
    try {
      const text = (response.content as any)[0].text;
      if (typeof content === 'string') {
        if (isNot)
          baseExpect(text.trim()).not.toBe(content.trim());
        else
          baseExpect(text.trim()).toBe(content.trim());
      } else {
        if (isNot)
          baseExpect(text).not.toMatch(content);
        else
          baseExpect(text).toMatch(content);
      }
    } catch (e) {
      return {
        pass: isNot,
        message: () => e.message,
      };
    }
    return {
      pass: !isNot,
      message: () => ``,
    };
  },

  toContainTextContent(response: Response, content: string | string[]) {
    const isNot = this.isNot;
    try {
      content = Array.isArray(content) ? content : [content];
      const texts = (response.content as any).map(c => c.text);
      for (let i = 0; i < texts.length; i++) {
        if (isNot)
          expect(texts[i]).not.toContain(content[i]);
        else
          expect(texts[i]).toContain(content[i]);
      }
    } catch (e) {
      return {
        pass: isNot,
        message: () => e.message,
      };
    }
    return {
      pass: !isNot,
      message: () => ``,
    };
  },
});
