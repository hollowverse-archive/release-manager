import * as express from 'express';

import { eb } from './eb';
import { ExtendedRequest } from './typings/extendedRequest';

const testInternalBuilds = express();

testInternalBuilds.use(async (req, _, next) => {
  try {
    const requestedEnvName: string | undefined = req.query.env;

    if (requestedEnvName) {
      const { Environments } = await eb
        .describeEnvironments({
          ApplicationName: 'hollowverse',
          IncludeDeleted: false,
          EnvironmentNames: [requestedEnvName],
        })
        .promise();

      if (Environments && Environments.length > 0) {
        const [env] = Environments;
        (req as ExtendedRequest).envUrl = env.EndpointURL;
      } else {
        console.info('No matching test environment');
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

export { testInternalBuilds };
