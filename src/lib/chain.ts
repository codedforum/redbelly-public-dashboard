import { defineChain, createPublicClient, http } from "viem";

// Redbelly Mainnet. Verified live: eth_chainId = 0x97 (151), RPC allows CORS.
export const RPC_URL =
  (import.meta as any).env?.VITE_REDBELLY_RPC || "https://governors.mainnet.redbelly.network";

export const redbelly = defineChain({
  id: 151,
  name: "Redbelly Mainnet",
  nativeCurrency: { name: "RBNT", symbol: "RBNT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Routescan", url: "https://redbelly.routescan.io" } },
});

// http transport with batching: concurrent calls collapse into one POST,
// which keeps the multi-block scan within the load budget.
export const client = createPublicClient({
  chain: redbelly,
  transport: http(RPC_URL, { batch: true, timeout: 12_000, retryCount: 2 }),
});

// Contract addresses (Redbelly mainnet, chain 151). All on-chain verified.
export const ADDR = {
  reddexFactory: "0x262E06314Af8f4EEd70dbd8C7EFe2a5De686C142",
  WRBNT: "0x6ed1F491e2d31536D6561f6bdB2AdC8F092a6076",
  USDT: "0x8c4acd74ff4385f3b7911432fa6787aa14406f8b",
  USDCe: "0x8201c02d4ab2214471e8c3ad6475c8b0cd9f2d06",
  WETH: "0x0fa205c0446cd9eedcc7538c9e24bc55ad08207f",
  AUDD: "0x54a210e824B0F89dA988E4B5586440aB354f0e46",
  sHUT: "0x93239eBEe8c0a43F77453B1bBD9803a9F947Ea84",
} as const;

// Tokens whose USD value is known on-chain (stablecoins = $1; WRBNT priced from pools).
export const STABLES = new Set(
  [ADDR.USDT, ADDR.USDCe].map((a) => a.toLowerCase())
);
export const DECIMALS: Record<string, number> = {
  [ADDR.WRBNT.toLowerCase()]: 18,
  [ADDR.USDT.toLowerCase()]: 6,
  [ADDR.USDCe.toLowerCase()]: 6,
  [ADDR.WETH.toLowerCase()]: 18,
};
