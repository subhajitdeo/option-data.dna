import json
import requests
from datetime import datetime
import os

EDGE_FUNCTION_URL = "https://xieigqijgxlsvkvjyesc.supabase.co/functions/v1/ltp-calc"
TRADES_FILE = "data/trades_history.json"

def fetch_latest_signal():
    try:
        response = requests.get(EDGE_FUNCTION_URL)
        print(f"API Response Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Response keys: {data.keys() if isinstance(data, dict) else 'not dict'}")
            return data
        return None
    except Exception as e:
        print(f"Error fetching signal: {e}")
        return None

def save_trade(trade_data):
    trades = []
    
    # Create data directory if it doesn't exist
    os.makedirs(os.path.dirname(TRADES_FILE), exist_ok=True)
    
    # Load existing trades
    if os.path.exists(TRADES_FILE):
        with open(TRADES_FILE, 'r') as f:
            try:
                trades = json.load(f)
            except:
                trades = []
    
    # Check for duplicate
    for t in trades:
        if t.get('timestamp', '')[:16] == trade_data['timestamp'][:16] and t.get('action') == trade_data['action']:
            print("⏸️ Trade already exists, skipping")
            return False
    
    trades.insert(0, trade_data)
    if len(trades) > 200:
        trades = trades[:200]
    
    with open(TRADES_FILE, 'w') as f:
        json.dump(trades, f, indent=2)
    
    print(f"✅ Trade saved: {trade_data['action']} at {trade_data['spot']}")
    return True

def main():
    print("🔄 Fetching latest signal...")
    data = fetch_latest_signal()
    
    if not data:
        print("⚠️ No data received from Edge Function")
        # Create empty trades file if it doesn't exist
        if not os.path.exists(TRADES_FILE):
            os.makedirs(os.path.dirname(TRADES_FILE), exist_ok=True)
            with open(TRADES_FILE, 'w') as f:
                json.dump([], f)
            print("📁 Created empty trades_history.json")
        return
    
    # Handle different response structures
    if 'data' in data:
        signal_data = data['data']
    elif 'success' in data and 'data' in data:
        signal_data = data['data']
    else:
        signal_data = data
    
    action = signal_data.get('trading_action', 'WAIT')
    print(f"Current Action: {action}")
    
    if action in ['BUY CE', 'BUY PE']:
        levels = signal_data.get('levels', {})
        trade = {
            "timestamp": datetime.now().isoformat(),
            "spot": signal_data.get('spot_price', 0),
            "action": action,
            "scenario": signal_data.get('coa_scenario', 0),
            "bias": signal_data.get('market_bias', 'UNKNOWN'),
            "entry": levels.get('eos', 0) if action == 'BUY CE' else levels.get('eor', 0),
            "target": levels.get('eor', 0) if action == 'BUY CE' else levels.get('eos', 0),
            "stopLoss": (levels.get('eos', 0) - 20) if action == 'BUY CE' else (levels.get('eor', 0) + 20),
            "status": "OPEN"
        }
        save_trade(trade)
    else:
        print(f"⏸️ No trade signal (Action: {action})")
        # Still ensure trades file exists
        if not os.path.exists(TRADES_FILE):
            os.makedirs(os.path.dirname(TRADES_FILE), exist_ok=True)
            with open(TRADES_FILE, 'w') as f:
                json.dump([], f)
            print("📁 Created empty trades_history.json")

if __name__ == "__main__":
    main()
