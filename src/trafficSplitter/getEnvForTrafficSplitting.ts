import { urlsByEnvironment } from './urlsByEnvironment';
import { createRandomEnvNameGenerator } from './getRandomEnvName';
import { weightsByEnvironment } from './environments';
import { EnvDetails } from '../typings/environments';
import * as isBot from 'is-bot';

const getEnvName = createRandomEnvNameGenerator(weightsByEnvironment);

/**
 * For a possible environment name (e.g. read from a cookie), this function
 * first tries to find the URL for the given environment and falls back to
 * a random environment if that fails. The returned object includes the name
 * and the URL of the final environment.
 */
const getEnvForTrafficSplitting = async (
  envName: string | undefined,
  userAgent?: string,
): Promise<EnvDetails> => {
  let envUrl;

  const map = await urlsByEnvironment;
  const defaultEnvironment = map.entries().next().value;

  // Always serve the default environment for search engines and other crawlers
  if (userAgent !== undefined && isBot(userAgent)) {
    [envName, envUrl] = defaultEnvironment;
  }

  if (!envName || map.get(envName) === undefined) {
    envName = getEnvName.next().value;
  }

  // Get the URL from the routing map, falling back to first environment
  // if the environment is defined but does not have a URL
  envUrl = map.get(envName);
  if (!envUrl) {
    [envName, envUrl] = defaultEnvironment;
  }

  return { name: envName, url: envUrl };
};

export { getEnvForTrafficSplitting };
