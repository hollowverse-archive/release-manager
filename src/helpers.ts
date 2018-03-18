export const prefix = (str: string) => `hollowverse-${str}`;

export const unprefix = (str: string) => str.replace(/^hollowverse-/, '');
