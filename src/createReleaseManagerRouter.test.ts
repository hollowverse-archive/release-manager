import express, { Express } from 'express';
import supertest, { SuperTest } from 'supertest'; // tslint:disable-line:no-implicit-dependencies
import {
  createReleaseManagerRouter,
  CreateReleaseManagerRouterOptions,
} from './createReleaseManagerRouter';
import { IncomingMessage, ServerResponse } from 'http';
import Chance from 'chance';

type TestContext = Readonly<
  CreateReleaseManagerRouterOptions & {
    app: Express;
    agent: SuperTest<supertest.Test>;
    modifyProxyResponse(req: IncomingMessage, res: ServerResponse): void;
  }
>;

const createTestContext = ({
  isSetCookieAllowedForPath = () => true,
  getEnvForBranchPreview = async branch => ({
    name: branch,
    url: `https://example.com/${branch}`,
  }),
  getEnvForTrafficSplitting = async (env = 'master', _userAgent) => ({
    name: env,
    url: `https://example.com/${env}`,
  }),
  forwardRequest,
  ...restOptions
}: Partial<CreateReleaseManagerRouterOptions> = {}): TestContext => {
  const app = express();
  const agent = supertest(app);
  const defaultForwardRequest: CreateReleaseManagerRouterOptions['forwardRequest'] = (
    _req,
    res,
  ) => {
    res.send();
  };

  const options: CreateReleaseManagerRouterOptions = {
    isSetCookieAllowedForPath: jest.fn(isSetCookieAllowedForPath),
    getEnvForBranchPreview: jest.fn(getEnvForBranchPreview),
    getEnvForTrafficSplitting: jest.fn(getEnvForTrafficSplitting),
    forwardRequest: jest.fn(forwardRequest || defaultForwardRequest),
    ...restOptions,
  };

  const { router, modifyProxyResponse } = createReleaseManagerRouter(options);

  app.use(router, (req, res, next) => {
    modifyProxyResponse(req, res);
    next();
  });

  return { app, agent, modifyProxyResponse, ...options };
};

describe('Release Manager', () => {
  let context: TestContext;
  beforeEach(async () => {
    context = createTestContext({
      async getEnvForTrafficSplitting(_envName, _userAgent) {
        return {
          name: 'master',
          url: 'https://example.com/master',
        };
      },
    });
  });

  describe('Traffic splitting', () => {
    it('checks if path is allowed for `Set-Cookie', async () => {
      await context.agent.get('/path');
      expect(context.isSetCookieAllowedForPath).toHaveBeenCalledTimes(1);
      expect(context.isSetCookieAllowedForPath).toHaveBeenCalledWith(
        expect.stringMatching(/\/path\/?/),
      );
    });

    it('sets the response `Set-Cookie` header on allowed paths', async () => {
      await context.agent
        .get('/path')
        .set('Cookie', 'env=master')
        .expect('set-cookie', /env=master/);
    });

    it('does not set the response `Set-Cookie` header on disallowed paths', async () => {
      context = await createTestContext({
        isSetCookieAllowedForPath: () => false,
      });

      const res = await context.agent.get('/path');
      expect(res.header).not.toHaveProperty('set-cookie');
    });

    it('reads request cookie and forwards to corresponding environment', async () => {
      await context.agent.get('/path').set('Cookie', 'env=master');

      expect(context.forwardRequest).toHaveBeenCalledTimes(1);
      expect(context.forwardRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          target: 'https://example.com/master',
        }),
      );
    });

    describe('if request does not have a env cookie,', () => {
      beforeEach(async () => {
        const chance = new Chance();

        context = await createTestContext({
          async getEnvForTrafficSplitting() {
            return chance.pickone([
              {
                url: 'https://example.com/beta',
                name: 'beta',
              },
              {
                url: 'https://example.com/master',
                name: 'master',
              },
            ]);
          },
        });
      });

      afterEach(() => {
        expect(context.getEnvForBranchPreview).not.toHaveBeenCalled();
        expect(context.getEnvForTrafficSplitting).toHaveBeenCalledTimes(1);
      });

      it('it picks an environment and forwards to corresponding environment', async () => {
        await context.agent.get('/path');

        expect(context.forwardRequest).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({
            target: expect.stringMatching(/beta|master/),
          }),
        );
      });

      it('sets a cookie on the response with the correct environment', async () => {
        context = await createTestContext({
          isSetCookieAllowedForPath: () => true,
          async getEnvForTrafficSplitting() {
            return {
              url: 'https://example.com/beta',
              name: 'beta',
            };
          },
        });

        await context.agent.get('/path').expect('set-cookie', /env=beta/);
      });
    });
  });
});
