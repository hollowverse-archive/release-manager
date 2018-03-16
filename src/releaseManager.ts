import express from 'express';
import helmet from 'helmet';
import { negate } from 'lodash';

import { health, setIsHealthy } from './health';
import { redirectToHttps } from './redirectToHttps';
import { getEnvForBranchPreview } from './branchPreviewer/getEnvForBranchPreview';
import { getEnvForTrafficSplitting } from './trafficSplitter/getEnvForTrafficSplitting';
import { createReleaseManagerRouter } from './createReleaseManagerRouter';
import { createProxyServer } from 'http-proxy';

process.on('unhandledRejection', () => {
  setIsHealthy(false);
});

const server = express();

server.use('/health', health);

server.use(redirectToHttps);

server.use(helmet.hidePoweredBy());

const proxyServer = createProxyServer();

proxyServer.on('error', (error, _, res) => {
  setIsHealthy(false);
  console.error('Proxy error:', error);

  res.writeHead(500, {
    'Content-Type': 'text/plain',
  });

  res.end('Something went wrong.');
});

const { router, modifyProxyResponse } = createReleaseManagerRouter({
  branchPreviewCookieName: 'branch',
  trafficSplittingCookieName: 'env',
  isSetCookieAllowedForPath: negate(
    path => path.startsWith('/static/') || path.startsWith('/log/'),
  ),
  getEnvForBranchPreview,
  getEnvForTrafficSplitting,
  forwardRequest: (
    req,
    res,
    { target, resolvedEnvironmentName, requestedBranchName },
  ) => {
    res.setHeader(
      'X-Hollowverse-Resolved-Environment',
      resolvedEnvironmentName,
    );

    if (requestedBranchName) {
      res.setHeader('X-Hollowverse-Requested-Environment', requestedBranchName);
    }

    proxyServer.web(req, res, {
      target,
      changeOrigin: true,
      toProxy: true,

      // If set to `true`, the process will crash when validating the certificate
      // of the environment endpoint, because that endpoint currently has a certificate
      // for `hollowverse.com` instead of the original Elastic Load Balancer sub-domain.
      secure: false,
    });
  },
});

proxyServer.on('proxyReq', (_, req, res) => modifyProxyResponse(req, res));

server.use(router);

server.listen(process.env.PORT);
