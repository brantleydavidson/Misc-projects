import type { HealthSnapshot, HealthConnection } from '../types/health';
import { getDeviceId } from './storage';

const BASE = '/.netlify/functions';

export async function getHealthStatus(): Promise<HealthConnection> {
  const res = await fetch(`${BASE}/health-status?device_id=${getDeviceId()}`);
  if (!res.ok) return { connected: false };
  return res.json();
}

export async function connectGarmin(): Promise<{ authorization_url: string } | null> {
  const res = await fetch(`${BASE}/health-connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: getDeviceId() }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function getHealthSnapshot(): Promise<HealthSnapshot | null> {
  const res = await fetch(`${BASE}/health-snapshot?device_id=${getDeviceId()}`);
  if (!res.ok) return null;
  return res.json();
}

export async function getHealthData(
  type: 'timeseries' | 'activity' | 'sleep' | 'body' | 'scores',
  startDate: string,
  endDate: string,
) {
  const res = await fetch(
    `${BASE}/health-data?device_id=${getDeviceId()}&type=${type}&start_date=${startDate}&end_date=${endDate}`,
  );
  if (!res.ok) return null;
  return res.json();
}
