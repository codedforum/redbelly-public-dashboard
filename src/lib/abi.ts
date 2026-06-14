// Minimal ABI fragments for the reads the dashboard performs.
export const factoryAbi = [
  { name: "allPairsLength", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "allPairs", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
] as const;

export const pairAbi = [
  { name: "token0", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "token1", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    name: "getReserves", type: "function", stateMutability: "view", inputs: [],
    outputs: [{ type: "uint112", name: "reserve0" }, { type: "uint112", name: "reserve1" }, { type: "uint32", name: "blockTimestampLast" }],
  },
] as const;

export const erc20Abi = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;
