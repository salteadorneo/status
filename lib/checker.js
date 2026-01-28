import net from 'net';
import dns from 'dns/promises';

const RETRIES = 3;
const RETRY_DELAY = 2000;

async function checkHTTP(service, attempt = 1) {
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
      status: response.status === service.expectedStatus ? 'up' : 'down',
      statusCode: response.status,
      responseTime: Date.now() - start,
      error: null
    };
  } catch (error) {
    if (attempt < RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return checkHTTP(service, attempt + 1);
    }
    return {
      status: 'down',
      statusCode: null,
      responseTime: Date.now() - start,
      error: error.message
    };
  }
}

async function checkTCP(service, attempt = 1) {
  const start = Date.now();
  
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: service.host,
      port: service.port,
      timeout: service.timeout
    });
    
    socket.on('connect', () => {
      socket.destroy();
      resolve({
        status: 'up',
        statusCode: null,
        responseTime: Date.now() - start,
        error: null
      });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      if (attempt < RETRIES) {
        setTimeout(async () => {
          const result = await checkTCP(service, attempt + 1);
          resolve(result);
        }, RETRY_DELAY);
      } else {
        resolve({
          status: 'down',
          statusCode: null,
          responseTime: Date.now() - start,
          error: 'Connection timeout'
        });
      }
    });
    
    socket.on('error', (error) => {
      socket.destroy();
      if (attempt < RETRIES) {
        setTimeout(async () => {
          const result = await checkTCP(service, attempt + 1);
          resolve(result);
        }, RETRY_DELAY);
      } else {
        resolve({
          status: 'down',
          statusCode: null,
          responseTime: Date.now() - start,
          error: error.message
        });
      }
    });
  });
}

async function checkDNS(service, attempt = 1) {
  const start = Date.now();
  try {
    await dns.resolve(service.domain);
    return {
      status: 'up',
      statusCode: null,
      responseTime: Date.now() - start,
      error: null
    };
  } catch (error) {
    if (attempt < RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return checkDNS(service, attempt + 1);
    }
    return {
      status: 'down',
      statusCode: null,
      responseTime: Date.now() - start,
      error: error.message
    };
  }
}

export async function checkUrl(service, attempt = 1) {
  if (service.maintenance) {
    return {
      id: service.id,
      name: service.name,
      url: service.url || service.host || service.domain,
      status: 'maintenance',
      statusCode: null,
      responseTime: 0,
      timestamp: new Date().toISOString(),
      error: null,
      maintenance: service.maintenance
    };
  }
  
  let result;
  if (service.type === 'tcp') {
    if (attempt === 1) console.log(`Checking TCP ${service.host}:${service.port}...`);
    result = await checkTCP(service, attempt);
  } else if (service.type === 'dns') {
    if (attempt === 1) console.log(`Checking DNS ${service.domain}...`);
    result = await checkDNS(service, attempt);
  } else {
    if (attempt === 1) console.log(`Checking HTTP ${service.url}...`);
    result = await checkHTTP(service, attempt);
  }
  
  let endpoint;
  if (service.type === 'tcp') {
    endpoint = `${service.host}:${service.port}`;
  } else if (service.type === 'dns') {
    endpoint = service.domain;
  } else {
    endpoint = service.url;
  }
  
  return {
    id: service.id,
    name: service.name,
    url: endpoint,
    status: result.status,
    statusCode: result.statusCode,
    responseTime: result.responseTime,
    timestamp: new Date().toISOString(),
    error: result.error
  };
}
