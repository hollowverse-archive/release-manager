import { urlsByEnvironment } from './urlsByEnvironment';
import { createRandomEnvNameGenerator } from './getRandomEnvName';
import { weightsByEnvironment } from './environments';
import { EnvDetails } from '../typings/environments';

const getEnvName = createRandomEnvNameGenerator(weightsByEnvironment);

const getEnvFromCookie = async (
  envName: string | undefined,
): Promise<EnvDetails> => {
  let envUrl;

  const map = await urlsByEnvironment;

  if (!envName || map.get(envName) === undefined) {
    envName = getEnvName.next().value;
  }

  // Get the URL from the routing map, falling back to first environment
  // if the environment is defined but does not have a URL
  envUrl = map.get(envName);
  if (!envUrl) {
    [envName, envUrl] = map.entries().next().value;
  }

  return { name: envName, url: envUrl };
};

export { getEnvFromCookie };
