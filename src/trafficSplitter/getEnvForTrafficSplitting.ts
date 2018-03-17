import isBot from 'is-bot';
import {
  GetEnvForTrafficSplitting,
  EnvDetails,
} from '../createReleaseManagerRouter';
import weighted from 'weighted';

type CreateGetEnvForTrafficSplittingOptions<EnvName extends string> = {
  weightsByEnvironment: Record<EnvName, number>;
  urlsByEnvironment: Promise<Map<EnvName, string>>;
  defaultEnvName: EnvName;
};

/**
 * For a possible environment name (e.g. read from a cookie), this function
 * first tries to find the URL for the given environment and falls back to
 * a random environment if that fails. The returned object includes the name
 * and the URL of the final environment.
 */
export const createGetEnvForTrafficSplitting = <EnvName extends string>({
  urlsByEnvironment,
  weightsByEnvironment,
  defaultEnvName,
}: CreateGetEnvForTrafficSplittingOptions<
  EnvName
>): GetEnvForTrafficSplitting => {
  const getEnvDetailsByName = async (envName: string): Promise<EnvDetails> => {
    const map = await urlsByEnvironment;

    const url = map.get(envName as EnvName);

    if (url !== undefined) {
      return {
        name: envName,
        url,
      };
    }

    throw new TypeError(`Could not find URL for environment ${envName}`);
  };

  const getEnvNameForTrafficSplitting = async (
    envName: string | undefined,
    userAgent?: string,
  ) => {
    // Always serve the default environment for search engines and other crawlers
    if (userAgent && isBot(userAgent)) {
      return defaultEnvName;
    }

    if (envName && envName in weightsByEnvironment) {
      return envName;
    }

    return weighted.select<string>(weightsByEnvironment);
  };

  return async (envName, userAgent) =>
    getEnvDetailsByName(
      await getEnvNameForTrafficSplitting(envName, userAgent),
    );
};
