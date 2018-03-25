#! /usr/bin/env node

/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
/* eslint-disable no-console */
const shelljs = require('shelljs');
const { decryptSecrets } = require('@hollowverse/utils/helpers/decryptSecrets');
const {
  executeCommands,
} = require('@hollowverse/utils/helpers/executeCommands');
const {
  executeCommandsInParallel,
} = require('@hollowverse/utils/helpers/executeCommandsInParallel');
const { writeJsonFile } = require('@hollowverse/utils/helpers/writeJsonFile');
const { createZipFile } = require('@hollowverse/utils/helpers/createZipFile');

const {
  ENC_PASS_AWS,
  IS_PULL_REQUEST,
  PROJECT,
  BRANCH,
  COMMIT_ID,
} = shelljs.env;

const isPullRequest = IS_PULL_REQUEST !== 'false';

const secrets = [
  {
    password: ENC_PASS_AWS,
    decryptedFilename: 'aws.json',
  },
];

const ebEnvironmentName = `${PROJECT}-${BRANCH}`;

async function main() {
  const buildCommands = [
    'yarn test',
    async () => {
      await executeCommandsInParallel(['yarn coverage/report', 'yarn build']);
    },
  ];
  const deploymentCommands = [
    () =>
      writeJsonFile('env.json', {
        BRANCH,
        COMMIT_ID,
      }),
    () => decryptSecrets(secrets, './secrets'),
    () =>
      createZipFile(
        'build.zip',
        [
          'dist/**/*',
          'secrets/**/*',
          'yarn.lock',
          'package.json',
          'env.json',
          'Dockerfile',
          '.dockerignore',
        ],
        ['secrets/**/*.enc'],
      ),
    `eb use ${ebEnvironmentName}`,
    'eb deploy --staged --debug --timeout 15',
  ];

  let isDeployment = false;
  if (isPullRequest === true) {
    console.info('Skipping deployment commands in PRs');
  } else if (secrets.some(secret => secret.password === undefined)) {
    console.info(
      'Skipping deployment commands because some secrets are not provided',
    );
  } else if (BRANCH !== 'master') {
    console.info('Skipping deployment because it is not the master branch');
  } else {
    isDeployment = true;
  }

  try {
    await executeCommands(
      isDeployment ? [...buildCommands, ...deploymentCommands] : buildCommands,
    );
  } catch (e) {
    console.error('Build/deployment failed:', e);
    process.exit(1);
  }
}

main();
