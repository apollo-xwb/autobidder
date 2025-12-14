# utils/report.py — run anytime to see your profits
import sqlite3
conn = sqlite3.connect('../bids.db')
c = conn.cursor()
print("=== LAST 20 WON JOBS ===")
for row in c.execute("SELECT * FROM bids WHERE status='won' ORDER BY applied_at DESC LIMIT 20"):
    print(row)
total = c.execute("SELECT SUM(profit) FROM bids WHERE status='won'").fetchone()[0] or 0
print(f"\nTOTAL PROFIT SO FAR: ${total:,.2f}")