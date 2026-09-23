import { api, baseUrl } from './api-client';

const serviceStartCommand =
  'PORT=4000 DATA_PATH=./data/requests.json node access-request-api.js';

export async function assertServiceReachable(): Promise<void> {
  try {
    const response = await api.listRequests();
    if (response.status !== 200) {
      throw new Error(`GET /requests returned HTTP ${response.status}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? ` (${error.message})` : '';
    throw new Error(
      `Access-request service is unreachable at ${baseUrl}. Start it with: ${serviceStartCommand}${detail}`,
    );
  }
}

export async function resetService(): Promise<void> {
  const response = await api.reset();
  if (response.kind !== 'success' || response.body.status !== 'ok') {
    throw new Error(`Service reset failed at ${baseUrl}: expected { status: 'ok' }`);
  }
}
