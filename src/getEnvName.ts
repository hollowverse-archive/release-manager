import * as Chance from 'chance';

const chance = new Chance();

/**
 * Returns a generator that produces the next environment to use for the
 * request being processed, ensuring that all environments get a fair chance to
 * serve the request weighted by their assigned distribution value, while still being
 * randomized.
 * @example For the distribution map above, this generator guarantees that for every
 * 5 new sessions, 4 of them will be served the `hollowverse-master` environment and 1 will be served
 * the `hollowverse-beta` environment. However, the order of the environments assigned to
 * one set of 5 sessions may differ from the next 5 sessions.
 */
export function* createEnvNameGenerator(
  weightsByEnvironment: Record<string, number>,
) {
  let cycle = { ...weightsByEnvironment };
  // tslint:disable-next-line:no-constant-condition
  while (true) {
    // Get a random environment, excluding environments that have been used
    const envName = chance.pickone(Object.keys(cycle)) as keyof typeof cycle;

    yield envName;

    // The environment has just been used one more time
    cycle[envName] = cycle[envName] <= 0 ? 0 : cycle[envName] - 1;

    if (cycle[envName] === 0) {
      delete cycle[envName];
    }

    // Reset usage counts if all environments have been fully used
    if (Object.keys(cycle).length === 0) {
      cycle = { ...weightsByEnvironment };
    }
  }
}
