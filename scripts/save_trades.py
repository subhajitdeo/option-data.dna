import json
import requests
from datetime import datetime
import os

# Your Edge Function URL
EDGE_FUNCTION_URL = "https://xieigqijgxlsvkvjyesc.supabase.co/functions/v1/ltp-calc"
TRADES_FILE = "data/trades_history.json"

def fetch_latest_signal():
    try:
        response = requests.get(EDGE_FUNCTION_URL)
        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None

def save_trade(trade_data):
    trades = []
    
    if os.path.exists(TRADES_FILE):
        with open(TRADES_FILE, 'r') as f:
            try:
                trades = json.load(f)
            except:
                trades = []
    
    # Check for duplicate
    for t in trades:
        if t['timestamp'][:16] == trade_data['timestamp'][:16] and t['action'] == trade_data['action']:
            print("Trade already exists")
            return False
    
    trades.insert(0, trade_data)
    if len(trades) > 200:
        trades = trades[:200]
    
    with open(TRADES_FILE, 'w') as f:
        json.dump(trades, f, indent=2)
    
    print(f"✅ Trade saved: {trade_data['action']} at {trade_data['spot']}")
    return True

def main():
    print("Fetching latest signal...")
    data = fetch_latest_signal()
    
    if not data or 'data' not in data:
        print("No valid signal")
        return
    
    signal_data = data.get('data', {})
    action = signal_data.get('trading_action', 'WAIT')
    
    if action in ['BUY CE', 'BUY PE']:
        trade = {
            "timestamp": datetime.now().isoformat(),
            "spot": signal_data.get('spot_price', 0),
            "action": action,
            "scenario": signal_data.get('coa_scenario', 0),
            "bias": signal_data.get('market_bias', 'UNKNOWN'),
            "entry": signal_data.get('levels', {}).get('eos', 0) if action == 'BUY CE' else signal_data.get('levels', {}).get('eor', 0),
            "target": signal_data.get('levels', {}).get('eor', 0) if action == 'BUY CE' else signal_data.get('levels', {}).get('eos', 0),
            "stopLoss": (signal_data.get('levels', {}).get('eos', 0) - 20) if action == 'BUY CE' else (signal_data.get('levels', {}).get('eor', 0) + 20),
            "status": "OPEN"
        }
        save_trade(trade)
    else:
        print(f"No trade signal (Action: {action})")

if __name__ == "__main__":
    main()
