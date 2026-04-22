export async function probeProvider(provider: any, region: string = 'us-east-1') {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(provider.url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const latency_ms = Date.now() - start;

    return {
      provider_id: provider.id,
      timestamp: new Date().toISOString(),
      latency_ms,
      status: res.ok ? 'success' : 'error',
      region
    };
  } catch (err: any) {
    return {
      provider_id: provider.id,
      timestamp: new Date().toISOString(),
      latency_ms: Date.now() - start,
      status: 'timeout',
      error: err.message,
      region
    };
  }
}
