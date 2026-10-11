/**
 * IPFS & Pinata Gateway Utilities
 */

export const PINATA_DEDICATED_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://teal-causal-tortoise-675.mypinata.cloud/ipfs";

/**
 * Returns an accessible URL for a given IPFS CID via our in-app proxy and viewer.
 */
export function getIPFSUrl(cid: string): string {
  if (!cid) return "";
  const cleanCID = cid.replace("ipfs://", "").trim();
  return `/api/ipfs/view?cid=${encodeURIComponent(cleanCID)}`;
}

/**
 * Returns the direct Pinata dedicated gateway URL.
 */
export function getDirectGatewayUrl(cid: string): string {
  if (!cid) return "";
  const cleanCID = cid.replace("ipfs://", "").trim();
  const gateway = PINATA_DEDICATED_GATEWAY.endsWith("/")
    ? PINATA_DEDICATED_GATEWAY.slice(0, -1)
    : PINATA_DEDICATED_GATEWAY;
  return `${gateway}/${cleanCID}`;
}

/**
 * Uploads a file to Pinata IPFS via our secure backend API route.
 * Keeps API secrets hidden on the server.
 */
export async function uploadToIPFS(file: File): Promise<{ cid: string; url: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/ipfs/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Upload failed with status: ${res.status}`);
  }

  const data = await res.json();
  return {
    cid: data.cid,
    url: getIPFSUrl(data.cid),
  };
}
