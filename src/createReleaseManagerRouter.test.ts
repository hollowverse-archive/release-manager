import express, { Express } from 'express';
import supertest, { SuperTest } from 'supertest'; // tslint:disable-line:no-implicit-dependencies
import {
  createReleaseManagerRouter,
  CreateReleaseManagerRouterOptions,
} from './createReleaseManagerRouter';
import { IncomingMessage, ServerResponse } from 'http';

type TestContext = CreateReleaseManagerRouterOptions & {
  app: Express;
  agent: SuperTest<supertest.Test>;
  modifyProxyResponse(req: IncomingMessage, res: ServerResponse): void;
};

const createTestContext = (
  {
    isSetCookieAllowedForPath,
    getEnvForBranchPreview,
    getEnvForTrafficSplitting,
    forwardRequest,
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
  let _modifyResponse: TestContext['modifyProxyResponse'];

  const options: CreateReleaseManagerRouterOptions = {
    isSetCookieAllowedForPath: jest.fn(isSetCookieAllowedForPath),
    getEnvForBranchPreview: jest.fn(getEnvForBranchPreview),
    getEnvForTrafficSplitting: jest.fn(getEnvForTrafficSplitting),
    forwardRequest: jest.fn(
      forwardRequest ||
        ((req, res, { target }) => {
          console.log('Requested forwarded to', target);
          _modifyResponse(req, res);
          res.send();
        }),
    ),
    ...restOptions,
  };

  const { router, modifyProxyResponse } = createReleaseManagerRouter(options);
  _modifyResponse = modifyProxyResponse;

  app.use(router);

  return { app, agent, modifyProxyResponse, ...options };
};

describe('Release Manager', () => {
  let context: TestContext;
  beforeEach(() => {
    context = createTestContext();
  });

  describe('Traffic splitting', () => {
    it('works', async () => {
      await context.agent.get('/path').then(r => r);
      expect(context.forwardRequest).toHaveBeenCalled();
    });
  });

  describe('Branch previewing', () => {});
});
