// tslint:disable await-promise no-implicit-dependencies
import express, { Express } from 'express';
import supertest, { SuperTest } from 'supertest';
import cookie from 'cookie';
import {
  createReleaseManagerRouter,
  CreateReleaseManagerRouterOptions,
} from './createReleaseManagerRouter';
import { ServerResponse, IncomingMessage, OutgoingMessage } from 'http';
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
  forwardRequest = (_req, res) => {
    res.send();
  },
  ...restOptions
}: Partial<CreateReleaseManagerRouterOptions> = {}): TestContext => {
  const app = express();
  const agent = supertest(app);
  let _modifyProxyResponse: (req: IncomingMessage, res: ServerResponse) => void;
  const patchedForwardRequest: typeof forwardRequest = (req, res, opts) => {
    const _send = res.send.bind(res);
    res.send = () => {
      _modifyProxyResponse(req, res);
      _send();

      return res;
    };
    forwardRequest(req, res, opts);
  };

  const options: CreateReleaseManagerRouterOptions = {
    isSetCookieAllowedForPath: jest.fn(isSetCookieAllowedForPath),
    getEnvForBranchPreview: jest.fn(getEnvForBranchPreview),
    getEnvForTrafficSplitting: jest.fn(getEnvForTrafficSplitting),
    forwardRequest: jest.fn(patchedForwardRequest),
    ...restOptions,
  };

  const { router, modifyProxyResponse } = createReleaseManagerRouter(options);
  _modifyProxyResponse = modifyProxyResponse;

  app.use(router);

  return { app, agent, modifyProxyResponse, ...options };
};

describe('Release Manager', () => {
  let context: TestContext;

  describe('Traffic splitting', () => {
    it('does not change the original `Cache-Control` header', async () => {
      const headerValue = 'public, max-age=2592000, immutable';
      context = await createTestContext({
        forwardRequest: async (_req, res) => {
          res.setHeader('Cache-Control', headerValue);
          res.send();
        },
      });

      await context.agent
        .get('/path')
        .set('Cookie', 'env=master')
        .expect('Cache-Control', headerValue);
    });

    beforeEach(async () => {
      context = createTestContext({
        getEnvForTrafficSplitting: async (_envName, _userAgent) => ({
          name: 'master',
          url: 'https://example.com/master',
        }),
      });
    });

    it('passes the requested environment and user agent to `getEnvForTrafficSplitting`', async () => {
      const chance = new Chance();
      const envName = chance.string();
      const userAgent = chance.string();

      await context.agent
        .get('/path')
        .set('Cookie', `env=${envName}`)
        .set('User-Agent', userAgent);

      expect(context.getEnvForTrafficSplitting).toHaveBeenCalledWith(
        envName,
        userAgent,
      );
    });

    it('checks if path is allowed for `Set-Cookie`', async () => {
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
        expect.any(IncomingMessage),
        expect.any(OutgoingMessage),
        expect.objectContaining({
          target: 'https://example.com/master',
        }),
      );
    });

    describe('if request does not have a env cookie,', () => {
      beforeEach(async () => {
        const chance = new Chance();

        context = await createTestContext({
          getEnvForTrafficSplitting: async () =>
            chance.pickone([
              {
                url: 'https://example.com/beta',
                name: 'beta',
              },
              {
                url: 'https://example.com/master',
                name: 'master',
              },
            ]),
        });
      });

      afterEach(() => {
        expect(context.getEnvForBranchPreview).not.toHaveBeenCalled();
        expect(context.getEnvForTrafficSplitting).toHaveBeenCalledTimes(1);
      });

      it('it picks an environment and forwards to corresponding environment', async () => {
        await context.agent.get('/path');

        expect(context.forwardRequest).toHaveBeenCalledWith(
          expect.any(IncomingMessage),
          expect.any(OutgoingMessage),
          expect.objectContaining({
            target: expect.stringMatching(/beta|master/),
          }),
        );
      });

      it('sets a cookie on the response with the correct environment', async () => {
        context = await createTestContext({
          isSetCookieAllowedForPath: () => true,
          getEnvForTrafficSplitting: async () => ({
            url: 'https://example.com/beta',
            name: 'beta',
          }),
        });

        await context.agent.get('/path').expect('set-cookie', /env=beta/);
      });

      it('allows customizing max age of cookie', async () => {
        const chance = new Chance();
        const maxAgeInSeconds = chance.natural();

        context = await createTestContext({
          isSetCookieAllowedForPath: () => true,
          trafficSplittingCookieMaxAge: maxAgeInSeconds * 1000,
          getEnvForTrafficSplitting: async () => ({
            url: 'https://example.com/master',
            name: 'master',
          }),
        });

        const cookies = (await context.agent.get('/path')).header['set-cookie'];
        const parsedCookie = cookie.parse(cookies.join(';'));
        expect(parsedCookie).toHaveProperty('Max-Age');
        expect(parsedCookie['Max-Age']).toEqual(String(maxAgeInSeconds));
      });
    });
  });

  describe('Branch previewing', () => {
    it('passes the requested branch name to `getEnvForBranchPreview`', async () => {
      const chance = new Chance();
      const branchName = chance.string();
      await context.agent.get('/path').set('Cookie', `branch=${branchName}`);
      expect(context.getEnvForBranchPreview).toHaveBeenCalledWith(branchName);
    });

    describe('Caching', () => {
      let testResponse: supertest.Response;

      afterEach(() => {
        expect(testResponse.header['cache-control']).toMatch(/s-maxage=0/);
        expect(testResponse.header['cache-control']).toMatch(
          /proxy-revalidate/,
        );
      });

      it('tells CDN not to cache the response', async () => {
        testResponse = await context.agent
          .get('/path?branch=test')
          .set('Cookie', 'env=master');
      });

      it('does not modify other parts of the `Cache-Control` header', async () => {
        const headerValue = 'public, max-age=2592000, immutable';
        context = await createTestContext({
          getEnvForBranchPreview: async () => ({
            name: 'test',
            url: 'https://example.com/branch/test',
          }),
          forwardRequest: async (_req, res) => {
            res.setHeader('Cache-Control', headerValue);
            res.send();
          },
        });

        testResponse = await context.agent
          .get('/path?branch=test')
          .set('Cookie', 'env=master');

        expect(testResponse.header['cache-control']).toMatch(headerValue);
      });
    });

    describe('If the requested branch actually exists', () => {
      beforeEach(async () => {
        context = await createTestContext({
          getEnvForBranchPreview: async branch => ({
            name: branch,
            url: `https://internal.example.com/branch/${branch}`,
          }),
          getEnvForTrafficSplitting: async (env = 'master') => ({
            name: env,
            url: `https://public.example.com/branch/${env}`,
          }),
        });
      });

      afterEach(() => {
        expect(context.getEnvForBranchPreview).toHaveBeenCalledTimes(1);
        expect(context.getEnvForTrafficSplitting).not.toHaveBeenCalled();
        expect(context.forwardRequest).toHaveBeenCalledTimes(1);
        expect(context.forwardRequest).toHaveBeenCalledWith(
          expect.any(IncomingMessage),
          expect.any(OutgoingMessage),
          expect.objectContaining({
            target: 'https://internal.example.com/branch/test',
          }),
        );
      });

      it('forwards request with the `branch` cookie to the correct branch', async () => {
        await context.agent.get('/path').set('Cookie', 'branch=test');
      });

      it('the `branch` query string parameter works exactly like the `branch` cookie', async () => {
        await context.agent.get('/path?branch=test');
      });

      it('`branch` cookie always takes precedence over `env` cookie', async () => {
        await context.agent
          .get('/path')
          .set('Cookie', 'env=master; branch=test');
      });

      it('`branch` query string parameter always takes precedence over `env` cookie', async () => {
        await context.agent
          .get('/path?branch=test')
          .set('Cookie', 'env=master;');
      });
    });

    describe('If the request branch does not exist', () => {
      beforeEach(async () => {
        context = await createTestContext({
          getEnvForBranchPreview: async () => undefined,
          getEnvForTrafficSplitting: async () => ({
            name: 'fallback',
            url: 'https://example.com/fallback',
          }),
        });
      });

      it('falls back to picking a regular, public environment', async () => {
        await context.agent.get('/path').set('Cookie', 'branch=test');
        expect(context.getEnvForBranchPreview).toHaveBeenCalledTimes(1);
        expect(context.getEnvForTrafficSplitting).toHaveBeenCalledTimes(1);
        expect(context.forwardRequest).toHaveBeenCalledWith(
          expect.any(IncomingMessage),
          expect.any(OutgoingMessage),
          expect.objectContaining({
            target: 'https://example.com/fallback',
          }),
        );
      });

      it('instructs browsers to delete the `branch` cookie', async () => {
        await context.agent
          .get('/path')
          .set('Cookie', 'branch=test')
          .expect('set-cookie', /branch=;/)
          .expect('set-cookie', /Expires=Thu, 01 Jan 1970/);
      });

      it('sets the `env` cookie to the picked environment', async () => {
        await context.agent
          .get('/path')
          .set('Cookie', 'branch=test')
          .expect('set-cookie', /env=fallback;/);
      });
    });
  });
});
