import { ElasticBeanstalk } from 'aws-sdk';
import { cloneDeep } from 'lodash';
import * as Chance from 'chance';

const chance = new Chance();

const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env;

const eb = new ElasticBeanstalk({
  region: 'us-east-1',
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection', error);
  process.exit(1);
});

const distributionMap = [
  {
    name: 'hollowverse-master',
    count: 4,
  },
  {
    name: 'hollowverse-beta',
    count: 1,
  },
];

export const routingMap = eb
  .describeEnvironments({
    ApplicationName: 'hollowverse',
    EnvironmentNames: distributionMap.map(({ name }) => name),
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
export function* createEnvNameGenerator() {
  let remainingRequestsByEnvironment = cloneDeep(distributionMap);
  // tslint:disable-next-line:no-constant-condition
  while (true) {
    // Get a random environment, excluding environments that have been used
    const env = chance.pickone(
      remainingRequestsByEnvironment.filter(({ count }) => count > 0),
    );

    yield env.name;

    // The environment has just been used one more time
    env.count -= 1;

    // Reset usage counts if all environments have been fully used
    if (remainingRequestsByEnvironment.every(({ count }) => count <= 0)) {
      remainingRequestsByEnvironment = cloneDeep(distributionMap);
    }
  }
}