# Option Chain Analyzer

A real-time options chain analysis tool that processes NIFTY option chain data to identify market structure, support/resistance levels, and generate trading signals.

## 🚀 Live Dashboard

[https://subhajitdeo.github.io/option-data.dna/](https://subhajitdeo.github.io/option-data.dna/)

## ⚠️ IMPORTANT DISCLAIMER

**This tool is still under active development. DO NOT use it for real trading decisions.**

- The developer does not take any responsibility for financial losses
- This is a learning project, not a trading advisory service
- Always consult a registered financial advisor before trading
- Past signals do not guarantee future results
- Use at your own risk

## 📊 What It Does

| Feature | Description |
|---------|-------------|
| **Live Market Analysis** | Fetches real-time NIFTY spot price and option chain data every 3 minutes |
| **Support & Resistance** | Identifies key support and resistance levels from Put/Call OI clusters |
| **Premium-Adjusted Levels** | Calculates true reversal levels using option premiums |
| **Market Structure** | Detects 9 different market scenarios based on OI concentration |
| **Trading Signals** | Generates clear BUY CE / BUY PE / WAIT signals with entry, target, and stop loss |
| **Option Chain Viewer** | Displays ATM ±7 strikes with OI, volume, and OI changes |
| **Trade History** | Automatically saves all generated trade signals for later review |

## 📈 How It Can Help (For Learning Purposes Only)

### 1. Understand Market Structure
- See how support and resistance form from OI clusters
- Learn how premium affects reversal levels

### 2. Study Market Scenarios
- Observe how different OI concentrations affect market direction
- Track scenario changes over time

### 3. Paper Trading
- Use the signals for practice trading
- Keep a journal of what would have happened

### 4. Historical Analysis
- Review past signals to understand market behavior
- No real money involved – just learning

## 📊 Market Scenarios Detected

| Scenario | Market Behavior | Signal |
|----------|-----------------|--------|
| 1 | Consolidation / Rangebound | WAIT |
| 2 | Bullish | BUY CE |
| 3 | Bearish | BUY PE |
| 4 | Bullish | BUY CE |
| 5 | Highly Bullish | BUY CE |
| 6 | Chaos | NO TRADE |
| 7 | Bearish | BUY PE |
| 8 | Whiplash | NO TRADE |
| 9 | Highly Bearish | BUY PE |

## 📁 Repository Structure

```
option-data.dna/
├── .github/workflows/
│   ├── fetch-option-chain.yml
│   └── save_trades.yml
├── data/
│   ├── option_chain.tsv
│   ├── spot_price.csv
│   └── trades_history.json
├── scripts/
│   ├── save_trades.py
│   └── advance code
├── .gitignore
├── README.md
├── index.html
└── view-trades.html
```

## 🔧 How It Works (Technical)

```
Google Sheets (NSE Data via Moneycontrol)
         ↓
Supabase Edge Function (Every 3 min)
         ↓
├─ Calculates Support/Resistance from OI clusters
├─ Computes premium-adjusted reversal levels
├─ Determines market scenario (1-9)
├─ Generates trading action with entry, target, stop loss
└─ Pushes to GitHub
         ↓
GitHub Pages Dashboard
         ↓
Study the signals for learning
```

## 📱 Mobile Support

The dashboard is fully responsive and works on mobile devices.

## ⏱️ Update Frequencies

| Data | Frequency |
|------|-----------|
| Spot price & signals | Every 30 seconds |
| Option chain | Every 5 minutes (market hours only) |
| Trade history saving | Every 5 minutes |

## ⚠️ FINAL WARNING

**This is a learning project. The developer is not responsible for any financial decisions you make. Never trade with money you cannot afford to lose. Always consult a SEBI-registered advisor before trading.**


