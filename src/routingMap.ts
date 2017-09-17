import * as fs from 'fs';
import * as path from 'path';
import { ElasticBeanstalk } from 'aws-sdk';

import { envNames } from './environments';

import { setIsHealthy } from './health';

const AWS_SECRET_PATH = path.join(process.cwd(), 'secrets/aws.json');

const { accessKeyId, secretAccessKey } = JSON.parse(
  fs.readFileSync(AWS_SECRET_PATH, 'utf8'),
) as AwsSecrets;

const eb = new ElasticBeanstalk({
  region: 'us-east-1',
  accessKeyId,
  secretAccessKey,
});

process.on('unhandledRejection', () => {
  setIsHealthy(false);
});

export const routingMap = eb
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
