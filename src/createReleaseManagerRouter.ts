import express from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { noop } from 'lodash';
import cookieParser from 'cookie-parser';

const cdnNoCacheDirectives = 's-maxage=0, proxy-revalidate';

type Context = {
  readonly requestedBranchName?: string;
  readonly requestedEnvironmentName?: string;
};

type RequestWithContext = IncomingMessage & { context: Context };

function isRequestWithContext(req: IncomingMessage): req is RequestWithContext {
  return 'context' in req;
}

export type EnvDetails = {
  name: string;
  url: string;
};

export type GetEnvForBranchPreview = (
  branch: string,
) => Promise<EnvDetails | undefined>;

export type GetEnvForTrafficSplitting = (
  envName: string | undefined,
  userAgent?: string,
) => Promise<EnvDetails>;

export type CreateReleaseManagerRouterOptions = {
  trafficSplittingCookieName?: string;
  branchPreviewCookieName?: string;
  getEnvForBranchPreview: GetEnvForBranchPreview;
  getEnvForTrafficSplitting: GetEnvForTrafficSplitting;
  isSetCookieAllowedForPath(path: string): boolean;
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

// tslint:disable-next-line:max-func-body-length
export const createReleaseManagerRouter = ({
  branchPreviewCookieName = 'branch',
  trafficSplittingCookieName = 'env',
  getEnvForBranchPreview,
  getEnvForTrafficSplitting,
  forwardRequest,
  isSetCookieAllowedForPath,
}: CreateReleaseManagerRouterOptions) => {
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

    // When a response is cached with `Cache-Control: immutable` (see above),
    // the browser will not even send a request to check if the resource
    // has been updated. So if for example the user was on the `new-app` branch
    // and they are switched to `master`, and if both branches has shared assets, the
    // browser will re-use the assets previously cached for `new-app`.
    //
    // Since the responses for these assets had `Set-Cookie: branch=new-app`,
    // the environment which was just routed to `master` will be set again to
    // `branch=new-app` when the asset is read from disk. So immutable caching
    // is causing the environment to be reset again to the branch that the user
    // was on when he first requested that asset.
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
          maxAge: 2 * 60 * 60 * 1000,
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
          maxAge: 24 * 60 * 60 * 1000,
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
