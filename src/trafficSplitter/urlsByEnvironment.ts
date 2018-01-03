import { eb } from '../eb';
import { envNames } from './environments';
import { prefix, unprefix } from '../helpers/prefix';

export const urlsByEnvironment = eb
  .describeEnvironments({
    ApplicationName: 'Hollowverse',
    EnvironmentNames: envNames.map(prefix),
    IncludeDeleted: false,
  })
  .promise()
  .then(({ Environments }) => {
    // tslint:disable no-non-null-assertion
    return new Map(
      Environments!.map(
        env =>
          [unprefix(env.EnvironmentName!), env.EndpointURL] as [string, string],
      ),
    );
    // tslint:enable no-non-null-assertion
  });
