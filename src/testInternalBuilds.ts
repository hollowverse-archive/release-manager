import * as express from 'express';

import { eb } from './eb';
import { ExtendedRequest } from './typings/extendedRequest';

const testInternalBuilds = express();

testInternalBuilds.use(async (req, _, next) => {
  const requestedEnvName: string | undefined = req.query.env;

  if (requestedEnvName) {
    const { Environments } = await eb
      .describeEnvironments({
        ApplicationName: 'hollowverse',
        IncludeDeleted: false,
        EnvironmentNames: [requestedEnvName],
      })
      .promise();

    if (Environments) {
      const [env] = Environments;
      (req as ExtendedRequest).envUrl = env.EndpointURL;
    }
  }

  next();
});

export { testInternalBuilds };
