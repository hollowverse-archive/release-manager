import * as express from 'express';
import * as httpProxy from 'http-proxy';
import * as cookieParser from 'cookie-parser';
import { noop } from 'lodash';

import { health, setIsHealthy } from './health';
import { redirectToHttps } from './redirectToHttps';
import { getEnvFromQueryString } from './branchPreviewer/getEnvFromQueryString';
import { getEnvFromCookie } from './trafficSplitter/getEnvFromCookie';

process.on('unhandledRejection', () => {
  setIsHealthy(false);
});

const proxyServer = httpProxy.createProxyServer();

const server = express();

server.use('/health', health);

server.use(redirectToHttps);

server.use(cookieParser());

server.use(async (req, res) => {
  let target: string | undefined;

  const { branch } = req.query;
  if (branch) {
    const env = await getEnvFromQueryString(branch).catch(noop);
    if (env) {
      res.clearCookie('env');
      target = env.url;
    }
  }

  if (!target) {
    const env = await getEnvFromCookie(req);
    target = env.url;
    res.cookie('env', env.name, {
      maxAge: 24 * 60 * 60 * 1000,
    });
  }

  proxyServer.web(req, res, {
    // tslint:disable-next-line:no-http-string
    target: `https://${target}`,
    changeOrigin: false,

    // If set to `true`, the process will crash when validating the certificate
    // of the environment endpoint, because that endpoint currently has a certificate
    // for `hollowverse.com` instead of the original Elastic Load Balancer sub-domain.
    secure: false,
  });
});

server.listen(process.env.PORT);
