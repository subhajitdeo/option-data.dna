// calc.ts - Runs every 3 minutes via GitHub Action

const OPTION_CHAIN_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRfm4xMi5EHOkU2nfZyx3ausnE_EjYQhJK9bE11RrPJvvToOvAfzfvdBUzzS4_HDdqsxZo0_OKnY9gE/pub?gid=0&single=true&output=csv';
const SPOT_PRICE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRfm4xMi5EHOkU2nfZyx3ausnE_EjYQhJK9bE11RrPJvvToOvAfzfvdBUzzS4_HDdqsxZo0_OKnY9gE/pub?gid=1940171500&single=true&output=csv';

// Helper: Fetch CSV
async function fetchCSV(url: string): Promise<string> {
  const res = await fetch(url);
  return res.text();
}

// Helper: Fetch spot price (single number)
async function fetchSpotPrice(): Promise<number> {
  const text = await fetchCSV(SPOT_PRICE_URL);
  let clean = text.trim().replace(/^"|"$/g, '').replace(/^\uFEFF/, '');
  const num = parseFloat(clean);
  if (isNaN(num)) throw new Error(`Spot price not numeric: "${clean}"`);
  return num;
}

// Helper: Parse option chain CSV
async function fetchOptionChain() {
  const text = await fetchCSV(OPTION_CHAIN_URL);
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV has no data rows');
  
  const rows = lines.slice(1);
  const strikes = [];
  
  for (const line of rows) {
    const cols = line.split(',').map(c => c.trim());
    if (cols.length < 11) continue;
    
    const strike = parseFloat(cols[5]);
    if (isNaN(strike)) continue;
    
    strikes.push({
      strike: strike,
      call_oi: parseFloat(cols[0]) || 0,
      call_volume: parseFloat(cols[2]) || 0,
      call_ltp: parseFloat(cols[4]) || 0,
      put_oi: parseFloat(cols[10]) || 0,
      put_volume: parseFloat(cols[8]) || 0,
      put_ltp: parseFloat(cols[6]) || 0,
    });
  }
  
  if (strikes.length === 0) throw new Error('No valid strikes parsed');
  return strikes;
}

// Core calculation functions
function findMaxByKey(arr: any[], key: string): any | null {
  if (!arr.length) return null;
  return arr.reduce((max, item) => item[key] > max[key] ? item : max, arr[0]);
}

function findSecondMaxByKey(arr: any[], key: string): { value: number; item: any | null } {
  if (arr.length < 2) return { value: 0, item: null };
  const sorted = [...arr].sort((a, b) => b[key] - a[key]);
  return { value: sorted[1][key], item: sorted[1] };
}

function getCOAScenario(peState: string, ceState: string): number {
  const map: Record<string, number> = {
    'STRONG_STRONG': 1, 'STRONG_WTT': 2, 'STRONG_WTB': 3,
    'WTT_STRONG': 4, 'WTT_WTT': 5, 'WTT_WTB': 6,
    'WTB_STRONG': 7, 'WTB_WTT': 8, 'WTB_WTB': 9,
  };
  return map[`${peState}_${ceState}`] || 0;
}

function getMarketBias(scenario: number): string {
  const biases: Record<number, string> = {
    1: 'CONSOLIDATION', 2: 'BULLISH', 3: 'BEARISH', 4: 'BULLISH',
    5: 'HIGHLY BULLISH', 6: 'VOLATILE CHAOS', 7: 'BEARISH',
    8: 'WHIPLASH RANGE', 9: 'HIGHLY BEARISH',
  };
  return biases[scenario] || 'UNKNOWN';
}

function getTradingRule(scenario: number): string {
  const rules: Record<number, string> = {
    1: 'Buy CE at EOS, Buy PE at EOR',
    2: 'Buy CE at EOS and every Put Diversion. NO SELLING PUTS',
    3: 'Buy PE at EOR and every Call Diversion. NO BUYING CALLS',
    4: 'Buy CE at EOS. Target next upper diversion',
    5: 'Buy CE aggressively at any dip. Hold past EOR',
    6: 'Stay flat. Market squeeze imminent',
    7: 'Buy PE at EOR. Target lower diversion band',
    8: 'Stay flat. Wide stop-losses required',
    9: 'Buy PE at every upward correction. Hold below EOS',
  };
  return rules[scenario] || 'No trade';
}

async function computeLTPMetrics() {
  console.log('Fetching data...');
  const [spotPrice, strikes] = await Promise.all([
    fetchSpotPrice(),
    fetchOptionChain(),
  ]);
  
  const atm = Math.round(spotPrice / 50) * 50;
  console.log(`Spot: ${spotPrice}, ATM: ${atm}, Strikes: ${strikes.length}`);
  
  const otmCalls = strikes.filter(s => s.strike > atm);
  const otmPuts = strikes.filter(s => s.strike < atm);
  
  if (!otmCalls.length || !otmPuts.length) {
    throw new Error(`No OTM data. Calls: ${otmCalls.length}, Puts: ${otmPuts.length}`);
  }
  
  // Resistance (Call side)
  const maxVolCall = findMaxByKey(otmCalls, 'call_volume');
  let resistanceStrike = maxVolCall?.strike || 0;
  const resistanceRow = strikes.find(s => s.strike === resistanceStrike);
  const callLtp = resistanceRow?.call_ltp || 0;
  const eor = resistanceStrike + callLtp;
  
  const { value: secondVol } = findSecondMaxByKey(otmCalls, 'call_volume');
  const maxVol = maxVolCall?.call_volume || 0;
  const ceStrength = maxVol ? (secondVol / maxVol) * 100 : 0;
  const ceState = ceStrength >= 75 ? 'WTT' : 'STRONG';
  
  // Support (Put side)
  const maxOiPut = findMaxByKey(otmPuts, 'put_oi');
  let supportStrike = maxOiPut?.strike || 0;
  const supportRow = strikes.find(s => s.strike === supportStrike);
  const putLtp = supportRow?.put_ltp || 0;
  const eos = supportStrike - putLtp;
  
  const { value: secondOi } = findSecondMaxByKey(otmPuts, 'put_oi');
  const maxOi = maxOiPut?.put_oi || 0;
  const peStrength = maxOi ? (secondOi / maxOi) * 100 : 0;
  const peState = peStrength >= 75 ? 'WTB' : 'STRONG';
  
  const scenario = getCOAScenario(peState, ceState);
  const bias = getMarketBias(scenario);
  const rule = getTradingRule(scenario);
  
  return {
    timestamp: new Date().toISOString(),
    spot_price: spotPrice,
    atm_strike: atm,
    resistance: {
      strike: resistanceStrike,
      state: ceState,
      strength: Math.round(ceStrength * 100) / 100,
      eor: eor,
    },
    support: {
      strike: supportStrike,
      state: peState,
      strength: Math.round(peStrength * 100) / 100,
      eos: eos,
    },
    coa_scenario: scenario,
    market_bias: bias,
    trading_rule: rule,
    soc_active: false,
  };
}

// Main execution
async function main() {
  try {
    const results = await computeLTPMetrics();
    
    // Save to GitHub
    await Deno.writeTextFile(
      './data/ltp_results.json',
      JSON.stringify(results, null, 2)
    );
    
    // Also maintain history (keep last 100 records)
    const historyFile = './data/history.json';
    let history = [];
    try {
      const existing = await Deno.readTextFile(historyFile);
      history = JSON.parse(existing);
    } catch {
      // File doesn't exist yet
    }
    
    history.unshift(results);
    if (history.length > 100) history = history.slice(0, 100);
    
    await Deno.writeTextFile(historyFile, JSON.stringify(history, null, 2));
    
    console.log('✅ LTP calculation complete!');
    console.log(`Spot: ${results.spot_price}, Scenario: ${results.coa_scenario}, Bias: ${results.market_bias}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

await main();
