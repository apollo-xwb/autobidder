# autobidder.py
import time
import sqlite3
import sys
import asyncio
import threading
from freelancersdk.session import Session
from freelancersdk.resources.projects import place_project_bid
import google.generativeai as genai
from telegram import Bot
from config import *

# === DATABASE ===
conn = sqlite3.connect('bids.db')
c = conn.cursor()
c.execute('''CREATE TABLE IF NOT EXISTS bids 
             (project_id INTEGER PRIMARY KEY, title TEXT, bid_amount REAL, 
              status TEXT DEFAULT 'applied', outsource_cost REAL, profit REAL, applied_at TEXT,
              bid_message TEXT, currency_code TEXT, prompt_id INTEGER, fallback_reason TEXT)''')
# Migrate: Add columns if they don't exist
for alter in [
    "ALTER TABLE bids ADD COLUMN bid_message TEXT",
    "ALTER TABLE bids ADD COLUMN currency_code TEXT",
    "ALTER TABLE bids ADD COLUMN prompt_id INTEGER",
    "ALTER TABLE bids ADD COLUMN fallback_reason TEXT",
]:
    try:
        c.execute(alter)
        conn.commit()
    except sqlite3.OperationalError:
        pass
conn.commit()

# === GEMINI SETUP ===
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-pro')

# === PERFECT BID PROMPT (fixed indentation and syntax) ===
PROMPT_TEMPLATE = """
You are an elite full-stack developer with 10+ years of experience, a 5.0 rating, 300+ reviews, and a portfolio full of React/Next.js, TypeScript, Node.js, mobile apps (React Native/Flutter), Three.js/WebGL, AR/VR, and game projects.

A client just posted this brand-new project on Freelancer.com (posted less than 2 minutes ago):

Title: {project_title}

Full description: {full_description}

Budget: ${budget_min}–${budget_max}
Skills listed: {skills_list}

Your job is to write the PERFECT first message (max 2–3 short paragraphs, 100–160 words) that wins the job almost every time.

Rules you MUST follow:
- Open with a hyper-specific observation about THEIR project in the very first sentence (reference something unique from the description that 99% of bidders will miss).
- Prove you read everything and already thought deeper than anyone else.
- Mention 1–2 directly relevant past projects from your portfolio with measurable results (speed improvement, revenue generated, user growth, etc.).
- Drop one impressive but believable industry stat or competitor insight that makes them think “this guy did research on my niche”.
- Make the tone confident, slightly playful, and human — never robotic or overly formal.
- End with a low-friction call-to-action + a specific question that forces them to reply.
- Do NOT mention price or delivery time in the first message (we handle that after they reply).
- Do NOT use the words “hope”, “looking forward”, “pleasure”, or any generic filler.

Write only the message itself. No greetings like “Hi there”, no sign-off. Just the body.
"""

async def async_notify(msg):
    if TELEGRAM_TOKEN and TELEGRAM_CHAT_ID:
        try:
            bot = Bot(token=TELEGRAM_TOKEN)
            await bot.send_message(chat_id=TELEGRAM_CHAT_ID, text=msg[:4000])
        except:
            pass

def notify(msg):
    """Send notification in background thread to avoid blocking"""
    def run_async():
        try:
            asyncio.run(async_notify(msg))
        except:
            pass
    thread = threading.Thread(target=run_async, daemon=True)
    thread.start()

# === RATE LIMIT HANDLING ===
rate_limit_backoff = 0  # Current backoff time in seconds
max_backoff = 300  # Maximum backoff time (5 minutes)
backoff_base = 2  # Exponential base

def get_projects():
    """Get projects with exponential backoff on rate limit errors"""
    global rate_limit_backoff
    
    try:
        session = Session(oauth_token=OAUTH_TOKEN)
        url = 'https://www.freelancer.com/api/projects/0.1/projects/active/'
        params = {
            'limit': 50,
            'full_description': True,    # Get full description for Gemini tailoring
            'job_details': True,         # Get skills/jobs
            'user_details': False        # We don't need owner details
        }
        response = session.session.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        projects = data.get('result', {}).get('projects', [])
        total_active = data.get('result', {}).get('total_count', 'unknown')
        print(f"Scanning {len(projects)} newest active projects (total on platform: {total_active})")
        
        # Success - reset backoff
        if rate_limit_backoff > 0:
            print(f"Rate limit cleared, resuming normal operation")
            rate_limit_backoff = 0
        
        return projects
    except Exception as e:
        error_str = str(e)
        # Check if it's a 429 rate limit error
        if '429' in error_str or 'TOO MANY REQUESTS' in error_str.upper():
            # Exponential backoff: 2^attempt seconds, capped at max_backoff
            if rate_limit_backoff == 0:
                rate_limit_backoff = backoff_base  # Start with 2 seconds
            else:
                rate_limit_backoff = min(rate_limit_backoff * backoff_base, max_backoff)
            
            wait_minutes = rate_limit_backoff / 60
            print(f"Rate limited (429). Waiting {rate_limit_backoff}s ({wait_minutes:.1f} min) before retry...")
            time.sleep(rate_limit_backoff)
            return []  # Return empty to trigger retry in main loop
        else:
            # Other errors - use normal poll interval
            print(f"Search error: {e}")
            if rate_limit_backoff > 0:
                rate_limit_backoff = 0  # Reset backoff on non-rate-limit errors
            return []

def good_project(p):
    """Returns (is_good, reason) tuple. reason is None if good, otherwise explains why rejected."""
    title = p.get('title', '').lower()
    desc = str(p.get('description', '') or '').lower()
    skills_text = " ".join([j.get('name', '').lower() for j in p.get('jobs', [])])
    full_text = f"{title} {desc} {skills_text}"

    budget_min = p.get('budget', {}).get('minimum', 0)
    bids_so_far = p.get('bid_stats', {}).get('bid_count', 0)

    # Check budget
    if budget_min < MIN_BUDGET:
        return (False, f"budget too low (${budget_min} < ${MIN_BUDGET})")
    
    # Check bid count
    if bids_so_far >= 25:
        return (False, f"too many bids ({bids_so_far} >= 25)")
    
    # Check niche keywords
    required_keywords = ['react', 'next.js', 'nextjs', 'react native', 'mobile app', 'web app', 'typescript', 'three.js', 'webgl', 'ar ', 'vr ', 'game development', 'flutter', 'pwa', 'ios development', 'android']
    is_niche = any(kw in full_text for kw in required_keywords)
    if not is_niche:
        return (False, "no matching niche keywords")
    
    return (True, None)

FALLBACK_MESSAGE = "I just saw your project and already have a clear plan to deliver exactly what you need. I've shipped similar projects before and can start quickly. What's the one feature or outcome you're most excited about so I can focus the plan around that first?"

def generate_message(p):
    """Returns (message, error_reason) tuple. error_reason is None if successful."""
    try:
        filled = PROMPT_TEMPLATE.format(
            project_title=p['title'],
            full_description=p.get('description', '')[:3000],
            budget_min=p.get('budget', {}).get('minimum', 0),
            budget_max=p.get('budget', {}).get('maximum', 0) or "open",
            skills_list=", ".join([j['name'] for j in p.get('jobs', [])])
        )
        response = model.generate_content(filled)
        return (response.text.strip(), None)
    except Exception as e:
        error_msg = str(e)
        print("Gemini failed:", error_msg)
        return (FALLBACK_MESSAGE, error_msg)

def calc_bid_amount(p):
    avg = p.get('bid_stats', {}).get('bid_avg')
    budget_min = p.get('budget', {}).get('minimum', 0)
    budget_max = p.get('budget', {}).get('maximum', 0) or budget_min * 2

    if avg is None or avg == 0:
        # For brand-new projects with no bids yet, bid 10% above minimum budget
        base = budget_min * 1.1
    else:
        base = avg * BID_AMOUNT_MULTIPLIER  # e.g. 5% above current average

    proposed = int(base)
    # Stay under budget and reasonable
    max_allowed = budget_max if budget_max else budget_min * 2
    return max(budget_min + 50, min(proposed, int(max_allowed * 0.9)))

def get_currency_code(project):
    """Extract currency code from project data."""
    budget_data = project.get('budget', {})
    currency_code = 'USD'  # Default
    
    # Try multiple ways to extract currency
    if isinstance(budget_data.get('currency'), dict):
        currency_code = budget_data.get('currency', {}).get('code', 'USD')
    elif budget_data.get('currency_code'):
        currency_code = budget_data.get('currency_code', 'USD')
    elif isinstance(budget_data.get('currency'), str):
        currency_code = budget_data.get('currency', 'USD')
    
    # Also check project level currency
    if currency_code == 'USD' and project.get('currency'):
        if isinstance(project.get('currency'), dict):
            currency_code = project.get('currency', {}).get('code', 'USD')
        elif isinstance(project.get('currency'), str):
            currency_code = project.get('currency', 'USD')
    
    return currency_code

def get_active_prompt_id():
    """Get the currently active prompt ID from the prompts table."""
    try:
        # Check if prompts table exists
        c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='prompts'")
        if not c.fetchone():
            return None
        
        c.execute("SELECT id FROM prompts WHERE is_active = 1 LIMIT 1")
        row = c.fetchone()
        return row[0] if row else None
    except Exception:
        return None

def bid(project):
    pid = project['id']
    amount = calc_bid_amount(project)
    msg, fallback_reason = generate_message(project)
    currency_code = get_currency_code(project)
    prompt_id = get_active_prompt_id()
    
    try:
        place_project_bid(
            Session(oauth_token=OAUTH_TOKEN),
            project_id=pid,
            bidder_id=YOUR_BIDDER_ID,
            amount=amount,
            period=DEFAULT_DELIVERY_DAYS,
            description=msg,
            milestone_percentage=50,  # <-- THIS WAS MISSING (50% default milestone)
        )
        # Store bid with all metadata
        c.execute("""INSERT OR REPLACE INTO bids 
                     (project_id, title, bid_amount, applied_at, bid_message, currency_code, prompt_id, fallback_reason) 
                     VALUES (?,?,?,datetime('now'),?,?,?,?)""",
                  (pid, project['title'], amount, msg, currency_code, prompt_id, fallback_reason))
        conn.commit()
        notify(f"BID PLACED → {project['title'][:50]} | ${amount} | ID: {pid}")
        print(f"BID SUCCESS → {pid} | ${amount} | {project['title'][:60]}")
    except Exception as e:
        print("Bid failed on", pid, ":", e)

# === CLI COMMANDS ===
if len(sys.argv) > 1:
    if sys.argv[1] == "--view":
        for row in c.execute("SELECT * FROM bids ORDER BY applied_at DESC LIMIT 50"):
            print(row)
    elif sys.argv[1] == "--cost" and len(sys.argv) == 4:
        pid, cost = int(sys.argv[2]), float(sys.argv[3])
        c.execute("SELECT bid_amount FROM bids WHERE project_id=?", (pid,))
        row = c.fetchone()
        if row:
            profit = row[0] - cost
            c.execute("UPDATE bids SET status='won', outsource_cost=?, profit=? WHERE project_id=?", (cost, profit, pid))
            conn.commit()
            notify(f"WIN UPDATED → ID {pid} | Cost ${cost} | Profit ${profit}")
            print(f"Updated {pid}: Profit ${profit}")
    sys.exit(0)

def check_stop_flag():
    """Check if stop flag file exists"""
    import os
    stop_flag_file = "autobidder_stop.flag"
    if os.path.exists(stop_flag_file):
        try:
            os.remove(stop_flag_file)  # Clean up the flag file
        except:
            pass
        return True
    return False

# === MAIN LOOP ===
seen = set()
scan_count = 0
print("Autobidder STARTED — Press Ctrl+C to stop")
while True:
    # Check for stop flag before each iteration
    if check_stop_flag():
        print("Stop flag detected. Shutting down...")
        break
    
    projects = get_projects()
    
    # Check stop flag again after API call (in case it was set during the call)
    if check_stop_flag():
        print("Stop flag detected. Shutting down...")
        break
    
    if not projects:
        # If we got rate limited, backoff already happened in get_projects()
        # For other errors, use normal poll interval
        if rate_limit_backoff == 0:
            # Sleep in small increments, checking stop flag periodically
            for _ in range(POLL_INTERVAL):
                if check_stop_flag():
                    print("Stop flag detected. Shutting down...")
                    break
                time.sleep(1)
            # Check one more time after sleep loop
            if check_stop_flag():
                print("Stop flag detected. Shutting down...")
                break
        continue
    
    scan_count += 1
    new_projects = 0
    already_seen = 0
    rejected = {'budget': 0, 'bids': 0, 'niche': 0}
    bid_count = 0
    
    for p in projects:
        pid = p['id']
        if pid in seen:
            already_seen += 1
            continue
        
        is_good, reason = good_project(p)
        if is_good:
            bid(p)
            seen.add(pid)
            bid_count += 1
        else:
            new_projects += 1
            seen.add(pid)  # Mark as seen so we don't keep re-checking rejected projects
            if reason:
                if 'budget' in reason.lower():
                    rejected['budget'] += 1
                elif 'bid' in reason.lower():
                    rejected['bids'] += 1
                elif 'niche' in reason.lower() or 'keyword' in reason.lower():
                    rejected['niche'] += 1
    
    # Log summary every scan
    summary = f"Scan #{scan_count}: {bid_count} bids placed, {new_projects} new rejected"
    if already_seen > 0:
        summary += f", {already_seen} already seen"
    if any(rejected.values()):
        reasons = []
        if rejected['budget'] > 0:
            reasons.append(f"{rejected['budget']} low budget")
        if rejected['bids'] > 0:
            reasons.append(f"{rejected['bids']} too many bids")
        if rejected['niche'] > 0:
            reasons.append(f"{rejected['niche']} no niche match")
        if reasons:
            summary += f" ({', '.join(reasons)})"
    print(summary)
    sys.stdout.flush()  # Ensure output appears immediately
    
    # Check stop flag before sleeping
    if check_stop_flag():
        print("Stop flag detected. Shutting down...")
        break
    
    # If all projects are already seen, wait a bit longer before next scan
    if already_seen == len(projects) and bid_count == 0:
        sleep_time = POLL_INTERVAL * 2  # Wait 2x longer if nothing new
    else:
        sleep_time = POLL_INTERVAL
    
    # Sleep in small increments, checking stop flag periodically
    for _ in range(sleep_time):
        if check_stop_flag():
            print("Stop flag detected. Shutting down...")
            break
        time.sleep(1)