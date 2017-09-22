import { EnvDetails } from '../typings/environments';
import { eb } from '../eb';

const getEnvFromQueryString = async (
  branch: string,
): Promise<EnvDetails | undefined> => {
  const { Environments } = await eb
    .describeEnvironments({
      ApplicationName: 'hollowverse',
      IncludeDeleted: false,
      EnvironmentNames: [`hollowverse-${branch}`],
    })
    .promise();

  if (Environments && Environments.length > 0) {
    const [env] = Environments;

    // tslint:disable:no-non-null-assertion
    return {
      name: env.EnvironmentName!,
      url: env.EndpointURL!,
    };
    // tslint:enable:no-non-null-assertion
  }

  return undefined;
};

export { getEnvFromQueryString };
