export async function retryWithBackoff(fn, retries = 5, delay = 500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn(); 
    } catch (err) {
      if (attempt === retries) {
        console.error(`All ${retries} retry attempts failed`);
        throw err;
      }

      const backoff = delay * Math.pow(2, attempt - 1); 
      console.warn(`Retry ${attempt} failed: ${err.message}. Retrying in ${backoff}ms...`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}
