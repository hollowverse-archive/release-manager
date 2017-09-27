import { EnvDetails } from '../typings/environments';
import { eb } from '../eb';
import { prefix, unprefix } from '../helpers/prefix';

/** 
 * For a given branch name (e.g. read from a cookie or query string), this function
 * looks for a matching, active EB environment and returns an object containing
 * the name and the URL of that environment. If no matching environment is found, 
 * or if the environment was terminated, this function returns `undefined`.
 */
const getEnvForBranchPreview = async (
  branch: string,
): Promise<EnvDetails | undefined> => {
  const { Environments } = await eb
    .describeEnvironments({
      ApplicationName: 'hollowverse',
      IncludeDeleted: false,
      EnvironmentNames: [prefix(branch)],
    })
    .promise();

  if (Environments && Environments.length > 0) {
    const [env] = Environments;

    // tslint:disable:no-non-null-assertion
    return {
      name: unprefix(env.EnvironmentName!),
      url: env.EndpointURL!,
    };
    // tslint:enable:no-non-null-assertion
  }

  return undefined;
};

export { getEnvForBranchPreview };
