import * as express from 'express';
import * as httpProxy from 'http-proxy';
import * as cookieParser from 'cookie-parser';
import { noop } from 'lodash';

import { health, setIsHealthy } from './health';
import { redirectToHttps } from './redirectToHttps';
import { getEnvForBranchPreview } from './branchPreviewer/getEnvForBranchPreview';
import { getEnvForTrafficSplitting } from './trafficSplitter/getEnvForTrafficSplitting';

process.on('unhandledRejection', () => {
  setIsHealthy(false);
});

const proxyServer = httpProxy.createProxyServer();

const server = express();

server.use('/health', health);

server.use(redirectToHttps);

server.use(cookieParser());

const trafficSplittingCookieName = 'env';
const branchPreviewCookieName = 'branch';

server.use(async (req, res) => {
  let endpoint: string | undefined;

  const branch = req.query.branch || req.cookies[branchPreviewCookieName];
  if (branch) {
    const env = await getEnvForBranchPreview(branch).catch(noop);
    if (env) {
      res.cookie(branchPreviewCookieName, env.name, {
        maxAge: 2 * 60 * 60 * 1000,
      });
      endpoint = env.url;
    }
  }

  if (!endpoint) {
    const env = await getEnvForTrafficSplitting(
      req.cookies[trafficSplittingCookieName],
    );
    endpoint = env.url;
    res.cookie(trafficSplittingCookieName, env.name, {
      maxAge: 24 * 60 * 60 * 1000,
    });
  }

  proxyServer.web(req, res, {
    // tslint:disable-next-line:no-http-string
    target: `https://${endpoint}`,
    changeOrigin: false,

    // If set to `true`, the process will crash when validating the certificate
    // of the environment endpoint, because that endpoint currently has a certificate
    // for `hollowverse.com` instead of the original Elastic Load Balancer sub-domain.
    secure: false,
  });
});

server.listen(process.env.PORT);
