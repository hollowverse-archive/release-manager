import express, { RequestHandler } from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import cookieParser from 'cookie-parser';
import { noop } from 'lodash';
import { GetEnvForBranchPreview } from './getEnvForBranchPreview';
import { GetEnvForTrafficSplitting } from './createGetEnvForTrafficSplitting';
import { EnvDetails } from './types';

const cdnNoCacheDirectives = 's-maxage=0, proxy-revalidate';

type Context = Readonly<{
  requestedBranchName?: string;
  requestedEnvironmentName?: string;
}>;

type RequestWithContext = IncomingMessage & { context: Context };

function isRequestWithContext(req: IncomingMessage): req is RequestWithContext {
  return 'context' in req;
}

export type CreateReleaseManagerRouterOptions = {
  /** The name of the cookie to use to stay on the same environment between sessions */
  trafficSplittingCookieName?: string;

  /**
   * Time, in milliseconds, after which the traffic splitting cookie expires and Release
   * Manager picks a new environment for the user
   */
  trafficSplittingCookieMaxAge?: number;

  /** The name of the cookie to use to stay on the preview branch between sessions */
  branchPreviewCookieName?: string;

  /**
   * Time, in milliseconds, after which the branch cookie expires and Release Manager
   * falls back to using the traffic splitting cookie (if it exists) or picks a new, public
   * environment for the user.
   */
  branchPreviewCookieMaxAge?: number;

  /**
   * Given a requested branch name, this function should return the name and the URL
   * of that branch if it exists, or `undefined` if it does not.
   */
  getEnvForBranchPreview: GetEnvForBranchPreview;

  /**
   * Given a requested environment name and a user agent string, this function
   * should return the name and URL of that function if and only if:
   * 1. an environment with that name actually exists
   * 2. the environment is public
   * Otherwise, this function should fall back to one of the available public
   * environments.
   * This function should not throw any errors.
   */
  getEnvForTrafficSplitting: GetEnvForTrafficSplitting;

  isSetCookieAllowedForPath(path: string): boolean;

  /**
   * A function that proxies the request to the target environment and modifies
   * the response to match the response of the target environment.
   * Further modifications to the proxy response are required before
   * the response is sent to the user, these are performed in
   * `modifyProxyResponse` which is returned by `createReleaseManagerRouter`
   * and which should be attached to the corresponding proxy server event.
   */
  forwardRequest(
    req: express.Request,
    res: express.Response,
    options: {
      target: string;
      requestedBranchName?: string;
      requestedEnvironmentName?: string;
      resolvedEnvironmentName: string;
    },
  ): void;
};

export type CreateReleaseManagerReturnType = {
  router: RequestHandler;
  /** A _synchronous_ function that modifies the response
   * returned from the target environment before the request is sent to the user.
   * It rewrites the `Cache-Control` header of the incoming response.
   * It should be attached to a suitable event on the proxy server that is used
   * to forward the request to the target environment.
   * @example
   * ```typescript
   * import proxyServer from 'http-proxy';
   * const proxyServer = createProxyServer();
   * const { router, modifyProxyResponse } = createReleaseManagerRouter({ ... });
   * ...
   * proxyServer.on('proxyReq', (_, req, res) => { modifyProxyResponse(req, res); });
   * ```
   */
  modifyProxyResponse(req: IncomingMessage, res: ServerResponse): void;
};

export const createReleaseManagerRouter = ({
  branchPreviewCookieName = 'branch',
  trafficSplittingCookieName = 'env',
  getEnvForBranchPreview,
  getEnvForTrafficSplitting,
  forwardRequest,
  isSetCookieAllowedForPath,
  trafficSplittingCookieMaxAge = 24 * 60 * 60 * 1000,
  branchPreviewCookieMaxAge = 2 * 60 * 60 * 1000,
}: CreateReleaseManagerRouterOptions): CreateReleaseManagerReturnType => {
  const router = express();

  router.use(cookieParser());

  const modifyProxyResponse = (req: IncomingMessage, res: ServerResponse) => {
    if (isRequestWithContext(req)) {
      const { requestedBranchName, requestedEnvironmentName } = req.context;
      if (
        requestedBranchName !== undefined ||
        requestedEnvironmentName === undefined
      ) {
        // We do not want CDN to cache internal branches or requests
        // that had no environments assigned to them before.

        // The `s-` prefix stands for "shared" and is only respected by
        // CDNs. Browsers will use the standard `maxage` directive.
        let header = res.getHeader('Cache-Control');
        if (!header) {
          res.setHeader('Cache-Control', cdnNoCacheDirectives);
        } else {
          if (Array.isArray(header)) {
            header = header[0];
          }

          res.setHeader('Cache-Control', `${header}, ${cdnNoCacheDirectives}`);
        }
      }
    }
  };

  router.use(async (req, res) => {
    let env: EnvDetails | void;

    // When a response is cached with `Cache-Control: immutable`,
    // the browser will not even send a request to check if the resource
    // has been updated. So if for example the user was on the `new-app` branch
    // and they are switched to `master`, and if both branches has shared assets, the
    // browser will re-use the assets previously cached for `new-app`.
    //
    // Since the responses for these assets had `Set-Cookie: branch=new-app`,
    // the environment which was just routed to `master` will be set again to
    // `branch=new-app` when the asset is read from disk. So immutable caching
    // is causing the environment to be reset again to the branch that the user
    // was on when the first requested that asset.
    // We should _not_ set the `Set-Cookie` header on static assets.

    // See https://github.com/hollowverse/hollowverse/issues/287
    const path = `${req.path.toLowerCase().replace(/\/$/i, '')}/`;

    const shouldSetCookie = isSetCookieAllowedForPath(path);

    const context: Context = {
      requestedBranchName:
        req.query.branch || req.cookies[branchPreviewCookieName] || undefined,
      requestedEnvironmentName:
        req.cookies[trafficSplittingCookieName] || undefined,
    };

    if (context.requestedBranchName) {
      env = await getEnvForBranchPreview(context.requestedBranchName).catch(
        noop,
      );
      if (env && shouldSetCookie) {
        res.cookie(branchPreviewCookieName, env.name, {
          maxAge: branchPreviewCookieMaxAge,
          httpOnly: true,
          secure: true,
        });
      }
    }

    if (!env || !env.url) {
      env = await getEnvForTrafficSplitting(
        context.requestedEnvironmentName,
        req.header('user-agent'),
      );

      if (shouldSetCookie) {
        res.clearCookie(branchPreviewCookieName);
        res.cookie(trafficSplittingCookieName, env.name, {
          maxAge: trafficSplittingCookieMaxAge,
          httpOnly: true,
          secure: true,
        });
      }
    }

    // @ts-ignore
    req.context = context;

    forwardRequest(req, res, {
      ...context,
      target: env.url,
      resolvedEnvironmentName: env.name,
    });
  });

  return { router, modifyProxyResponse };
};
