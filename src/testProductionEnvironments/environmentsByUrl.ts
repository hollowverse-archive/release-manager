import { eb } from '../eb';
import { envNames } from './environments';

export const environmentsByUrl = eb
  .describeEnvironments({
    ApplicationName: 'hollowverse',
    EnvironmentNames: envNames,
    IncludeDeleted: false,
  })
  .promise()
  .then(({ Environments }) => {
    // tslint:disable no-non-null-assertion
    return new Map(
      Environments!.map(
        env => [env.EnvironmentName!, env.EndpointURL!] as [string, string],
      ),
    );
    // tslint:enable no-non-null-assertion
  });
