import express from 'express';
import httpProxy from 'http-proxy';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { noop } from 'lodash';

import { health, setIsHealthy } from './health';
import { redirectToHttps } from './redirectToHttps';
import { getEnvForBranchPreview } from './branchPreviewer/getEnvForBranchPreview';
import { getEnvForTrafficSplitting } from './trafficSplitter/getEnvForTrafficSplitting';
import { EnvDetails } from './typings/environments.d';
import { IncomingMessage } from 'http';

process.on('unhandledRejection', () => {
  setIsHealthy(false);
});

const proxyServer = httpProxy.createProxyServer();

proxyServer.on('error', (error, _, res) => {
  setIsHealthy(false);
  console.error('Proxy error:', error);

  res.writeHead(500, {
    'Content-Type': 'text/plain',
  });

  res.end('Something went wrong.');
});

const server = express();

server.use('/health', health);

server.use(redirectToHttps);

server.use(helmet.hidePoweredBy());

server.use(cookieParser());

const trafficSplittingCookieName = 'env';
const branchPreviewCookieName = 'branch';

type Context = {
  readonly requestedBranchName?: string;
  readonly requestedEnvironmentName?: string;
};

type RequestWithContext = IncomingMessage & { context: Context };

function isRequestWithContext(req: IncomingMessage): req is RequestWithContext {
  return 'context' in req;
}

proxyServer.on('proxyRes', (_, req, res) => {
  if (isRequestWithContext(req)) {
    const { requestedBranchName, requestedEnvironmentName } = req.context;
    if (
      requestedBranchName !== undefined ||
      requestedEnvironmentName === undefined
    ) {
      // We do not want CDN to cache internal branches or requests
      // that had no environments assigned to them before.

      // The `s-` prefix stands for "shared" and is only respected by
      // CDNs. Browsers will use the standard `max-age` directive.
      let header = res.getHeader('Cache-Control');
      if (!header) {
        res.setHeader('Cache-Control', 's-max-age=0, proxy-revalidate');
      } else {
        if (Array.isArray(header)) {
          header = header[0];
        }

        res.setHeader(
          'Cache-Control',
          `${header}, s-max-age=0, proxy-revalidate`,
        );
      }
    }
  }
});

server.use(async (req, res) => {
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

  const shouldNotSetCookie =
    path.startsWith('/static/') || path.startsWith('/log/');

  const context: Context = {
    requestedBranchName:
      req.query.branch || req.cookies[branchPreviewCookieName] || undefined,
    requestedEnvironmentName:
      req.cookies[trafficSplittingCookieName] || undefined,
  };

  if (context.requestedBranchName) {
    res.setHeader(
      'X-Hollowverse-Requested-Environment',
      context.requestedBranchName,
    );

    env = await getEnvForBranchPreview(context.requestedBranchName).catch(noop);
    if (env && !shouldNotSetCookie) {
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

    if (!shouldNotSetCookie) {
      res.clearCookie(branchPreviewCookieName);
      res.cookie(trafficSplittingCookieName, env.name, {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: true,
      });
    }
  }

  res.setHeader('X-Hollowverse-Resolved-Environment', env.name);

  // @ts-ignore
  req.context = context;

  proxyServer.web(req, res, {
    // tslint:disable-next-line:no-http-string
    target: `https://${env.url}`,
    changeOrigin: true,
    toProxy: true,

    // If set to `true`, the process will crash when validating the certificate
    // of the environment endpoint, because that endpoint currently has a certificate
    // for `hollowverse.com` instead of the original Elastic Load Balancer sub-domain.
    secure: false,
  });
});

server.listen(process.env.PORT);
