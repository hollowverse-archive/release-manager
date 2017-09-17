/** This map MUST NOT contain weights <= 0 */
export const weightsByEnvironment = Object.freeze({
  'hollowverse-master': 4,
  'hollowverse-beta': 1,
});

export const envNames = Object.keys(weightsByEnvironment);
