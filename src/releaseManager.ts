import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import * as httpProxy from 'http-proxy';
import { first } from 'lodash';

import { health } from './health';
import { routingMap, createEnvNameGenerator } from './routingMap';

const getEnvName = createEnvNameGenerator();

const proxyServer = httpProxy.createProxyServer();

const server = express();

server.use('/health', health);

server.use(cookieParser());

server.use(async (req, res) => {
  const map = await routingMap;
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

  res.cookie('env', envName);
  proxyServer.web(req, res, {
    // tslint:disable-next-line:no-http-string
    target: `https://${envUrl}`,
    changeOrigin: false,
    secure: false,
  });
});

server.listen(8080);
