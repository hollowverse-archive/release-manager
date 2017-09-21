import * as express from 'express';
import * as httpProxy from 'http-proxy';
import * as cookieParser from 'cookie-parser';

import { health, setIsHealthy } from './health';
import { redirectToHttps } from './redirectToHttps';
import { testInternalBuilds } from './testInternalBuilds';
import { testProductionEnvironments } from './testProductionEnvironments/middleware';
import { ExtendedRequest } from './typings/extendedRequest';

process.on('unhandledRejection', () => {
  setIsHealthy(false);
});

const proxyServer = httpProxy.createProxyServer();

const server = express();

server.use('/health', health);

server.use(redirectToHttps);

testProductionEnvironments.use(cookieParser());

server.use(testInternalBuilds);

server.use(testProductionEnvironments);

server.use((req, res) => {
  proxyServer.web(req, res, {
    // tslint:disable-next-line:no-http-string
    target: `https://${(req as ExtendedRequest).envUrl}`,
    changeOrigin: false,

    // If set to `true`, the process will crash when validating the certificate
    // of the environment endpoint, because that endpoint currently has a certificate
    // for `hollowverse.com` instead of the original Elastic Load Balancer sub-domain.
    secure: false,
  });
});

server.listen(process.env.PORT);
