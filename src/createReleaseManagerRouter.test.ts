import express, { Express } from 'express';
import supertest, { SuperTest } from 'supertest'; // tslint:disable-line:no-implicit-dependencies
import {
  createReleaseManagerRouter,
  CreateReleaseManagerRouterOptions,
} from './createReleaseManagerRouter';

type TestContext = CreateReleaseManagerRouterOptions & {
  app: Express;
  agent: SuperTest<supertest.Test>;
};

const createTestContext = (
  {
    isSetCookieAllowedForPath,
    getEnvForBranchPreview,
    getEnvForTrafficSplitting,
    ...restOptions
  }: Partial<CreateReleaseManagerRouterOptions> = {
    isSetCookieAllowedForPath: () => true,
    getEnvForTrafficSplitting: async (env = 'master', _userAgent) => ({
      name: env,
      url: `https://example.com/${env}`,
    }),
    getEnvForBranchPreview: async branch => ({
      name: branch,
      url: `https://example.com/${branch}`,
    }),
  },
): TestContext => {
  const app = express();
  const agent = supertest(app);
  const options: CreateReleaseManagerRouterOptions = {
    isSetCookieAllowedForPath: jest.fn(isSetCookieAllowedForPath),
    getEnvForBranchPreview: jest.fn(getEnvForBranchPreview),
    getEnvForTrafficSplitting: jest.fn(getEnvForTrafficSplitting),
    ...restOptions,
  };

  app.use(createReleaseManagerRouter(options));

  return { app, agent, ...options };
};

describe('Release Manager', () => {
  let context: TestContext;
  beforeEach(() => {
    context = createTestContext();
  });

  describe('Traffic splitting', () => {
    it('works', async () => {
      expect(await context.agent.get('/path')).toBe(1);
    });
  });

  describe('Branch previewing', () => {});
});
