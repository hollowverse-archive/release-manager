import * as express from 'express';

import { environmentsByUrl } from './environmentsByUrl';
import { createEnvNameGenerator } from './getEnvName';
import { weightsByEnvironment } from './environments';
import { ExtendedRequest } from '../typings/extendedRequest';

const getEnvName = createEnvNameGenerator(weightsByEnvironment);

const testProductionEnvironments = express();

testProductionEnvironments.use(async (req, res, next) => {
  // Skip if request has already been assigned a test environment
  if (!(req as ExtendedRequest).envUrl) {
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
      envName = map.keys().next().value;
      envUrl = map.get(envName);
    }

    res.cookie('env', envName, {
      maxAge: 24 * 60 * 60 * 1000,
    });

    (req as ExtendedRequest).envUrl = envUrl;
  }

  next();
});

export { testProductionEnvironments };
