import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import * as httpProxy from 'http-proxy';
import { first } from 'lodash';
import { URL } from 'url';

import { health } from './health';
import { environmentsByUrl } from './routingMap';
import { createEnvNameGenerator } from './getEnvName';
import { weightsByEnvironment } from './environments';

const getEnvName = createEnvNameGenerator(weightsByEnvironment);

const proxyServer = httpProxy.createProxyServer();

const server = express();

server.use('/health', health);

// Redirect HTTP requests to HTTPS
server.use((req, res, next) => {
  const protocol = req.header('X-FORWARDED-PROTO');
  const host = req.header('Host') || 'hollowverse.com';
  if (protocol === 'http') {
    const newURL = new URL(req.url, `https://${host}`);
    res.redirect(newURL.toString());
  } else {
    next();
  }
});

server.use(cookieParser());

server.use(async (req, res) => {
  const map = await environmentsByUrl;
  let envName: string | undefined = req.cookies.env;
  let envUrl: string | undefined;
  if (!envName || map.get(envName) === undefined) {
    envName = getEnvName.next().value;
  }

  // Get the URL from the routing map, falling back to first environment
  // if the environment is defined but does not have a URL
  envUrl = map.get(envName);
  if (!envUrl) {
    envName = first(Array.from(map.keys())) as string;
    envUrl = map.get(envName);
  }

  res.cookie('env', envName, {
    maxAge: 24 * 60 * 60 * 1000,
  });

  proxyServer.web(req, res, {
    // tslint:disable-next-line:no-http-string
    target: `https://${envUrl}`,
    changeOrigin: false,

    // If set to `true`, the process will crash when validating the certificate
    // of the environment endpoint, because that endpoint currently has a certificate
    // for `hollowverse.com` instead of the original Elastic Load Balancer sub-domain.
    secure: false,
  });
});

server.listen(process.env.PORT);
