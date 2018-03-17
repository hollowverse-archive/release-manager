// tslint:disable no-floating-promises no-implicit-dependencies
import {
  createGetEnvForTrafficSplitting,
  GetEnvForTrafficSplitting,
} from './createGetEnvForTrafficSplitting';
import { times, uniq, countBy, mapValues } from 'lodash';
import bluebird from 'bluebird';

describe('`getEnvForTrafficSplitting`', () => {
  let getEnvForTrafficSplitting: GetEnvForTrafficSplitting;

  beforeEach(() => {
    getEnvForTrafficSplitting = createGetEnvForTrafficSplitting({
      defaultEnvName: 'master',
      urlsByEnvironment: Promise.resolve(
        new Map([
          ['master', 'https://master.example.com'],
          ['beta', 'https://beta.example.com'],
        ]),
      ),
      weightsByEnvironment: {
        master: 0.75,
        beta: 0.25,
      },
    });
  });

  describe('If no specific environment is requested', () => {
    it('picks a random environment based on specified weights for regular users', async () => {
      const numTests = 1000;
      const results = await bluebird.map(times(numTests), async () => {
        return getEnvForTrafficSplitting(undefined);
      });

      expect(uniq(results)).toContainEqual({
        name: 'master',
        url: 'https://master.example.com',
      });

      expect(uniq(results)).toContainEqual({
        name: 'beta',
        url: 'https://beta.example.com',
      });

      const counts = mapValues(
        countBy(results, ({ name }) => name),
        v => v / numTests,
      );

      expect(counts.master).toBeCloseTo(0.75, 1);
      expect(counts.beta).toBeCloseTo(0.25, 1);
    });

    it('always picks the default environment for bots', async () => {
      await bluebird.map(times(1000), async () => {
        const { url, name } = await getEnvForTrafficSplitting(
          undefined,
          'Googlebot',
        );
        expect(name).toBe('master');
        expect(url).toBe('https://master.example.com');
      });
    });
  });

  describe('If the requested environment exists', () => {
    it('returns the requested environment', async () => {
      const { name, url } = await getEnvForTrafficSplitting('beta');

      expect(name).toBe('beta');
      expect(url).toBe('https://beta.example.com');
    });
  });

  describe('If the requested environment does not exist', () => {
    it('does not throw, instead falls back to one of the existing environments', async () => {
      expect(getEnvForTrafficSplitting('nonExistent')).resolves.toEqual({
        name: expect.stringMatching(/beta|master/),
        url: expect.stringMatching(/beta|master/),
      });
    });
  });
});
