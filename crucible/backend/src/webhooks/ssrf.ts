import { lookup } from "node:dns/promises";
import net from "node:net";

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

export async function assertWebhookUrlSafe(urlText: string): Promise<void> {
  const url = new URL(urlText);
  if (url.protocol !== "https:") throw new Error("Webhook URL must use HTTPS");

  const resolved = await lookup(url.hostname, { all: true });
  if (resolved.length === 0) throw new Error("Webhook hostname did not resolve");

  for (const address of resolved) {
    if (net.isIPv4(address.address) && isPrivateIpv4(address.address)) {
      throw new Error("Webhook URL resolves to a private IPv4 address");
    }
    if (net.isIPv6(address.address) && isPrivateIpv6(address.address)) {
      throw new Error("Webhook URL resolves to a private IPv6 address");
    }
  }
}
