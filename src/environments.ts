import { eb } from './eb';
import { prefix, unprefix } from './helpers';

/** This map MUST NOT contain weights <= 0 */
export const weightsByEnvironment = Object.freeze({
  master: 0.75,
  beta: 0.25,
});

export const envNames = Object.keys(weightsByEnvironment);

export const defaultEnvName = envNames[0];

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
