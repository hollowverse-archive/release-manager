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

server.use(
  createReleaseManagerRouter({
    branchPreviewCookieName: 'branch',
    trafficSplittingCookieName: 'env',
    isSetCookieAllowedForPath: negate(
      path => path.startsWith('/static/') || path.startsWith('/log/'),
    ),
    getEnvForBranchPreview,
    getEnvForTrafficSplitting,
    proxyServer,
  }),
);

server.listen(process.env.PORT);
