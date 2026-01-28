const RETRIES = 3;
const RETRY_DELAY = 2000;

export async function checkUrl(service, attempt = 1) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), service.timeout);
    const response = await fetch(service.url, {
      method: service.method || 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'Status-Monitor/1.0' }
    });
    clearTimeout(timeout);
    
    return {
      id: service.id,
      name: service.name,
      url: service.url,
      status: response.status === service.expectedStatus ? 'up' : 'down',
      statusCode: response.status,
      responseTime: Date.now() - start,
      timestamp: new Date().toISOString(),
      error: null
    };
  } catch (error) {
    if (attempt < RETRIES) {
      console.log(`Retry ${attempt}/${RETRIES} for ${service.name} after ${RETRY_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return checkUrl(service, attempt + 1);
    }
    return {
      id: service.id,
      name: service.name,
      url: service.url,
      status: 'down',
      statusCode: null,
      responseTime: Date.now() - start,
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}
