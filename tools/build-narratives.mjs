#!/usr/bin/env node
// Regenerates app/data/narratives.json from CoinGecko categories.
// Usage: node tools/build-narratives.mjs
// Each narrative maps to one or more CoinGecko category ids; we keep the
// 250 largest members of each category (that covers the top 300 easily).

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const NARRATIVES = [
  { id: 'l1', label: 'L1', categories: ['layer-1'] },
  { id: 'l2', label: 'L2', categories: ['layer-2'] },
  { id: 'defi', label: 'DeFi', categories: ['decentralized-finance-defi'] },
  { id: 'dex', label: 'DEX', categories: ['decentralized-exchange'] },
  { id: 'perps', label: 'Perps', categories: ['decentralized-perpetuals'] },
  { id: 'lending', label: 'Lending', categories: ['lending-borrowing'] },
  { id: 'meme', label: 'Meme', categories: ['meme-token'] },
  { id: 'ai', label: 'AI', categories: ['artificial-intelligence'] },
  { id: 'rwa', label: 'RWA', categories: ['real-world-assets-rwa'] },
  { id: 'oracle', label: 'Oracle', categories: ['oracle'] },
  { id: 'lst', label: 'Liquid Staking', categories: ['liquid-staking'] },
  { id: 'privacy', label: 'Privacy', categories: ['privacy-coins'] },
  { id: 'gaming', label: 'Gaming', categories: ['gaming'] },
  { id: 'depin', label: 'DePIN', categories: ['depin'] },
  { id: 'zk', label: 'ZK', categories: ['zero-knowledge-zk'] },
  { id: 'cex', label: 'CEX', categories: ['centralized-exchange-token-cex'] },
  { id: 'stocks', label: 'Actions', categories: ['tokenized-stock'] },
  { id: 'gold', label: 'Or', categories: ['tokenized-gold'] },
];

const API = 'https://api.coingecko.com/api/v3/coins/markets';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchCategory(category) {
  const url = `${API}?vs_currency=usd&category=${category}&order=market_cap_desc&per_page=250&page=1`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (res.status === 429) {
      await sleep(15000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${category}: HTTP ${res.status}`);
    return res.json();
  }
  throw new Error(`${category}: rate limited`);
}

const members = {};
for (const n of NARRATIVES) {
  for (const cat of n.categories) {
    const coins = await fetchCategory(cat);
    for (const c of coins) {
      if (!c.market_cap_rank || c.market_cap_rank > 1500) continue;
      const list = (members[c.id] ??= []);
      if (!list.includes(n.id)) list.push(n.id);
    }
    console.log(`${n.label.padEnd(15)} ${cat.padEnd(32)} ${coins.length} coins`);
    await sleep(2500);
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  source: 'CoinGecko categories',
  narratives: NARRATIVES.map(({ id, label }) => ({ id, label })),
  members: Object.fromEntries(Object.entries(members).sort(([a], [b]) => a.localeCompare(b))),
};

const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/data/narratives.json');
await writeFile(dest, JSON.stringify(out) + '\n');
console.log(`Wrote ${Object.keys(members).length} coins to ${dest}`);
