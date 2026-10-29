import { withRetry } from './retry';

test('withRetry: успех с первой попытки — одна попытка', async () => {
  const calls: number[] = [];
  await expect(
    withRetry(
      async () => {
        calls.push(1);
        return 'ok';
      },
      3,
      0,
    ),
  ).resolves.toBe('ok');
  expect(calls).toHaveLength(1);
});

test('withRetry: два промаха, успех на третьей', async () => {
  let n = 0;
  await expect(
    withRetry(
      async () => {
        n += 1;
        if (n < 3) throw new Error('обрыв');
        return 'ok';
      },
      3,
      0,
    ),
  ).resolves.toBe('ok');
  expect(n).toBe(3);
});

test('withRetry: все попытки пали — бросается последняя ошибка', async () => {
  let n = 0;
  await expect(
    withRetry(
      async () => {
        n += 1;
        throw new Error(`обрыв ${n}`);
      },
      3,
      0,
    ),
  ).rejects.toThrow('обрыв 3');
  expect(n).toBe(3);
});
