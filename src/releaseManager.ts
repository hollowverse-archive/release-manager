import * as express from 'express';
import * as httpProxy from 'http-proxy';
import * as cookieParser from 'cookie-parser';
import * as helmet from 'helmet';
import { noop } from 'lodash';

import { health, setIsHealthy } from './health';
import { redirectToHttps } from './redirectToHttps';
import { getEnvForBranchPreview } from './branchPreviewer/getEnvForBranchPreview';
import { getEnvForTrafficSplitting } from './trafficSplitter/getEnvForTrafficSplitting';
import { EnvDetails } from './typings/environments.d';

process.on('unhandledRejection', () => {
  setIsHealthy(false);
});

const proxyServer = httpProxy.createProxyServer();

const server = express();

server.use('/health', health);

server.use(redirectToHttps);

server.use(helmet.hidePoweredBy());

server.use(cookieParser());

const trafficSplittingCookieName = 'env';
const branchPreviewCookieName = 'branch';

server.use(async (req, res) => {
  let env: EnvDetails | void;
  const isStaticResource = req.path.toLowerCase().startsWith('/static');
  
  const branch = req.query.branch || req.cookies[branchPreviewCookieName];
  if (branch) {
    res.setHeader('X-Hollowverse-Requested-Environment', branch);
    
    env = await getEnvForBranchPreview(branch).catch(noop);
    if (env && !isStaticResource) {
      res.cookie(branchPreviewCookieName, env.name, {
        maxAge: 2 * 60 * 60 * 1000,
        httpOnly: true,
        secure: true,
      });
    }
  }
  
  if (!env || !env.url) {
    env = await getEnvForTrafficSplitting(
      req.cookies[trafficSplittingCookieName],
      req.header('user-agent'),
    );
    
    if (!isStaticResource) {
      res.clearCookie(branchPreviewCookieName);
      res.cookie(trafficSplittingCookieName, env.name, {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: true,
      });
    }
  }
  
  res.setHeader('X-Hollowverse-Resolved-Environment', env.name);

  proxyServer.web(req, res, {
    // tslint:disable-next-line:no-http-string
    target: `https://${env.url}`,
    changeOrigin: false,

    // If set to `true`, the process will crash when validating the certificate
    // of the environment endpoint, because that endpoint currently has a certificate
    // for `hollowverse.com` instead of the original Elastic Load Balancer sub-domain.
    secure: false,
  });
});

server.listen(process.env.PORT);
