import os from 'node:os';

export function getLanIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push(iface.address);
      }
    }
  }

  // Prefer common private subnets (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  const preferred = candidates.find((ip) => ip.startsWith('192.168.')) ||
    candidates.find((ip) => ip.startsWith('10.')) ||
    candidates.find((ip) => /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip));

  return preferred || candidates[0] || 'localhost';
}
