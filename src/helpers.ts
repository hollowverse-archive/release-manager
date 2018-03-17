export function prefix(str: string) {
  return `hollowverse-${str}`;
}

export function unprefix(str: string) {
  return str.replace(/^hollowverse-/, '');
}
