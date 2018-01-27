/** This map MUST NOT contain weights <= 0 */
export const weightsByEnvironment = Object.freeze({
  master: 4,
  beta: 1,
});

export const envNames = Object.keys(weightsByEnvironment);

export const defaultEnvName = envNames[0];
