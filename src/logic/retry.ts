/**
 * Повтор нетерпеливых чтений: на медленном интернете одиночный запрос
 * умирает чаще, чем успевает пройти. Любая ошибка повторяется — чтение
 * не меняет данные, лишняя попытка безопасна.
 */
export async function withRetry<T>(
  op: () => PromiseLike<T>,
  attempts: number = 3,
  delayMs: number = 350,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await op();
    } catch (e) {
      if (attempt >= attempts) throw e;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
