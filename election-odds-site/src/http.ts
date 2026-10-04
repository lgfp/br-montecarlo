const USER_AGENT = 'br-montecarlo/1.0 (+https://github.com/lgfp/br-montecarlo)';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch() that survives the odd transient failure (a CDN answering 403/429/5xx to a CI runner, a dropped connection):
 * up to `attempts` tries with growing pauses. Other statuses (404 etc.) are returned as they are.
 */
export async function fetchRetry(url: string, init: RequestInit = {}, { attempts = 4, baseDelayMs = 2000 } = {}): Promise<Response> {
  const headers = { 'User-Agent': USER_AGENT, ...init.headers };
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers });
      const transient = res.status === 403 || res.status === 429 || res.status >= 500;
      if (!transient || attempt === attempts) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (attempt === attempts) throw err;
    }
    console.warn(`fetch ${new URL(url).host}: ${lastError instanceof Error ? lastError.message : lastError}; retry ${attempt}/${attempts - 1}`);
    await wait(baseDelayMs * attempt);
  }
  throw lastError;
}
