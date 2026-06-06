export function mapGuacConnections(json) {
  return Object.values(json || {})
    .map((connection) => ({
      name: connection.name,
      protocol: connection.protocol,
      hostname: connection.parameters?.hostname,
      port: connection.parameters?.port,
    }))
    .filter((connection) => connection.name);
}

export async function getGuacConnections({
  url = process.env.GUAC_URL,
  user = process.env.GUAC_USER,
  pass = process.env.GUAC_PASS,
  fetchImpl = fetch,
} = {}) {
  if (!url || !user || !pass) return [];

  try {
    const base = url.replace(/\/$/, '');
    const tokenRes = await fetchImpl(`${base}/api/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: user, password: pass }),
    });
    if (!tokenRes.ok) return [];

    const tokenJson = await tokenRes.json();
    const token = tokenJson.authToken;
    const dataSource = tokenJson.dataSource || 'mysql';
    if (!token) return [];

    const connectionsRes = await fetchImpl(`${base}/api/session/data/${dataSource}/connections?token=${encodeURIComponent(token)}`);
    if (!connectionsRes.ok) return [];

    return mapGuacConnections(await connectionsRes.json());
  } catch {
    return [];
  }
}
