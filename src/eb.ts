import * as fs from 'fs';
import * as path from 'path';
import { ElasticBeanstalk } from 'aws-sdk';

const AWS_SECRET_PATH = path.join(process.cwd(), 'secrets/aws.json');

const { accessKeyId, secretAccessKey } = JSON.parse(
  fs.readFileSync(AWS_SECRET_PATH, 'utf8'),
) as AwsSecrets;

export const eb = new ElasticBeanstalk({
  region: 'us-east-1',
  accessKeyId,
  secretAccessKey,
  apiVersion: '2010-12-01',
});
