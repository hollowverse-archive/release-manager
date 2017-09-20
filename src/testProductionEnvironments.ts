import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import { first } from 'lodash';

import { environmentsByUrl } from './routingMap';
import { createEnvNameGenerator } from './getEnvName';
import { weightsByEnvironment } from './environments';
import { ExtendedRequest } from './typings/extendedRequest';

const getEnvName = createEnvNameGenerator(weightsByEnvironment);

const testProductionEnvironments = express();

testProductionEnvironments.use(cookieParser());

testProductionEnvironments.use(async (req, res, next) => {
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

  (req as ExtendedRequest).envUrl = envUrl;

  next();
});

export { testProductionEnvironments };
