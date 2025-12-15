# autobidder.py
import time
import sqlite3
import sys
import asyncio
import threading
import logging
import hashlib
import re
from datetime import datetime
from freelancersdk.session import Session
from freelancersdk.resources.projects import place_project_bid
import google.generativeai as genai
from telegram import Bot
from config import *

# === LOGGING SETUP ===
LOG_FILE = 'autobidder.log'
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.FileHandler(LOG_FILE, mode='a', encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

def log(message):
    """Log message with timestamp"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    logger.info(message)
    return f"{timestamp} | {message}"

# === DATABASE ===
# Thread-safe database operations
_db_lock = threading.Lock()

def init_database():
    """Initialize database schema"""
    conn = sqlite3.connect('bids.db', check_same_thread=False)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS bids 
                 (project_id INTEGER PRIMARY KEY, title TEXT, bid_amount REAL, 
                  status TEXT DEFAULT 'applied', outsource_cost REAL, profit REAL, applied_at TEXT, bid_message TEXT, prompt_hash TEXT, currency_code TEXT, prompt_id INTEGER)''')
    # Migrate: Add columns if they don't exist
    try:
        c.execute("ALTER TABLE bids ADD COLUMN prompt_hash TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # Column already exists
    try:
        c.execute("ALTER TABLE bids ADD COLUMN currency_code TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # Column already exists
    try:
        c.execute("ALTER TABLE bids ADD COLUMN prompt_id INTEGER")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # Column already exists
    conn.commit()
    conn.close()

def get_db_connection():
    """Get a thread-safe database connection"""
    conn = sqlite3.connect('bids.db', check_same_thread=False, timeout=10.0)
    return conn

# Initialize database schema
init_database()

# === GEMINI SETUP ===
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-pro')

# === PERFECT BID PROMPT (default fallback) ===
DEFAULT_PROMPT_TEMPLATE = """
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
- Drop one impressive but believable industry stat or competitor insight that makes them think "this guy did research on my niche".
- Make the tone confident, slightly playful, and human — never robotic or overly formal.
- End with a low-friction call-to-action + a specific question that forces them to reply.
- Do NOT mention price or delivery time in the first message (we handle that after they reply).
- Do NOT use the words "hope", "looking forward", "pleasure", or any generic filler.

Write only the message itself. No greetings like "Hi there", no sign-off. Just the body.
"""

def load_active_prompt():
    """Load active prompt from database, fallback to default"""
    try:
        with _db_lock:
            db_conn = get_db_connection()
            try:
                db_c = db_conn.cursor()
                # Check if prompts table exists
                db_c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='prompts'")
                if db_c.fetchone():
                    db_c.execute("SELECT template FROM prompts WHERE is_active = 1 LIMIT 1")
                    result = db_c.fetchone()
                    if result:
                        return result[0]
            finally:
                db_conn.close()
    except Exception as e:
        log(f"Error loading prompt from database: {e}, using default")
    return DEFAULT_PROMPT_TEMPLATE

# Load prompt template
PROMPT_TEMPLATE = load_active_prompt()

async def async_notify(msg):
    if TELEGRAM_TOKEN and TELEGRAM_CHAT_ID:
        try:
            bot = Bot(token=TELEGRAM_TOKEN)
            await bot.send_message(chat_id=TELEGRAM_CHAT_ID, text=msg[:4000])
        except:
            pass

def notify(msg):
    def run_in_thread():
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(async_notify(msg))
            loop.close()
        except:
            pass
    threading.Thread(target=run_in_thread, daemon=True).start()

# Cache for user skills
_user_skills_cache = None

def get_user_skills():
    """Get user's skills from profile or config"""
    global _user_skills_cache
    if _user_skills_cache is not None:
        return _user_skills_cache
    
    # If skills are configured in config, use those
    if MY_SKILLS:
        _user_skills_cache = [s.lower().strip() for s in MY_SKILLS]
        log(f"Using {len(_user_skills_cache)} skills from config")
        return _user_skills_cache
    
    # Try to fetch from API
    try:
        session = Session(oauth_token=OAUTH_TOKEN)
        url = f'https://www.freelancer.com/api/users/0.1/users/{YOUR_BIDDER_ID}/'
        params = {'qualification_details': True}
        response = session.session.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        user = data.get('result', {})
        
        # Get skills from qualifications
        skills = []
        qualifications = user.get('qualifications', [])
        for q in qualifications:
            skill_name = q.get('skill', {}).get('name', '')
            if skill_name:
                skills.append(skill_name.lower().strip())
        
        if skills:
            _user_skills_cache = skills
            log(f"Fetched {len(skills)} skills from profile: {', '.join(skills[:10])}{'...' if len(skills) > 10 else ''}")
            return _user_skills_cache
    except Exception as e:
        log(f"Could not fetch skills from profile: {e}")
    
    # Fallback: use the keywords from good_project as skills
    fallback_skills = ['react', 'next.js', 'nextjs', 'react native', 'mobile app', 'web app', 
                       'typescript', 'three.js', 'webgl', 'ar', 'vr', 'game development', 
                       'flutter', 'pwa', 'ios development', 'android']
    _user_skills_cache = fallback_skills
    log(f"Using fallback skills. Add MY_SKILLS to config.py for accurate filtering.")
    return _user_skills_cache

def get_projects():
    """Fetch projects from Freelancer API. Returns (projects_list, is_rate_limited)"""
    try:
        session = Session(oauth_token=OAUTH_TOKEN)
        url = 'https://www.freelancer.com/api/projects/0.1/projects/active/'
        params = {
            'limit': 100,  # Increased to get more projects per scan
            'full_description': True,    # Get full description for Gemini tailoring
            'job_details': True,         # Get skills/jobs
            'user_details': False,       # We don't need owner details
            'sort': 'latest'            # Sort by latest to get newest first
        }
        response = session.session.get(url, params=params)  # <-- This is the key line
        response.raise_for_status()
        data = response.json()
        projects = data.get('result', {}).get('projects', [])
        total_active = data.get('result', {}).get('total_count', 'unknown')
        log(f"Fetched {len(projects)} newest active projects (total on platform: {total_active})")
        return projects, False  # Return projects and rate_limit status
    except Exception as e:
        error_str = str(e)
        # Check if it's a 429 rate limit error
        if '429' in error_str or 'TOO MANY REQUESTS' in error_str.upper():
            log(f"Rate limited (429): {error_str}")
            return [], True  # Return empty list and rate_limit=True
        else:
            log(f"Search error: {e}")
            return [], False  # Other error, not rate limited

def convert_to_usd(amount, currency_code):
    """Convert amount from given currency to USD"""
    if not currency_code or currency_code.upper() == 'USD':
        return amount
    
    # Currency conversion rates (approximate, update as needed)
    # These are rough estimates - for production, use a real API like exchangerate-api.com
    conversion_rates = {
        'INR': 0.012,  # 1 INR = 0.012 USD (approx 83 INR = 1 USD)
        'EUR': 1.08,
        'GBP': 1.27,
        'AUD': 0.66,
        'CAD': 0.74,
        'JPY': 0.0067,
        'CNY': 0.14,
        'MXN': 0.058,
        'BRL': 0.20,
        'ZAR': 0.054,
        'SGD': 0.74,
        'HKD': 0.13,
        'NZD': 0.61,
        'SEK': 0.095,
        'NOK': 0.095,
        'DKK': 0.14,
        'PLN': 0.25,
        'CHF': 1.12,
        'AED': 0.27,
        'SAR': 0.27,
    }
    
    rate = conversion_rates.get(currency_code.upper(), 1.0)
    return amount * rate

def good_project(p):
    budget_data = p.get('budget', {})
    budget_min = budget_data.get('minimum', 0)
    currency_code = budget_data.get('currency', {}).get('code') or budget_data.get('currency_code') or 'USD'
    bids_so_far = p.get('bid_stats', {}).get('bid_count', 0)
    pid = p.get('id', 'unknown')
    title = p.get('title', '')[:50]
    
    # Check project age - only bid on very new projects (if MAX_PROJECT_AGE_MINUTES > 0)
    if MAX_PROJECT_AGE_MINUTES > 0:
        try:
            # Try different possible field names for project creation time
            time_submitted = p.get('time_submitted') or p.get('submitdate') or p.get('time_created') or p.get('created_time') or p.get('submit_date')
            if time_submitted:
                # Convert to timestamp if it's a string
                if isinstance(time_submitted, str):
                    from datetime import datetime
                    try:
                        # Try parsing ISO format (e.g., "2025-12-13T12:00:00Z")
                        if 'T' in time_submitted:
                            dt = datetime.fromisoformat(time_submitted.replace('Z', '+00:00'))
                            time_submitted = dt.timestamp()
                        else:
                            # Try parsing as Unix timestamp string
                            time_submitted = float(time_submitted)
                    except:
                        try:
                            # Try parsing Unix timestamp string
                            time_submitted = float(time_submitted)
                        except:
                            time_submitted = None
                
                if time_submitted and isinstance(time_submitted, (int, float)):
                    age_seconds = time.time() - time_submitted
                    age_minutes = age_seconds / 60
                    if age_minutes > MAX_PROJECT_AGE_MINUTES:
                        log(f"Project {pid} skipped: Too old ({age_minutes:.1f} min > {MAX_PROJECT_AGE_MINUTES} min)")
                        return False
        except Exception as e:
            # If we can't determine age, allow it (better to bid than skip)
            pass
    
    # Convert budget to USD and check against MIN_BUDGET
    budget_min_usd = convert_to_usd(budget_min, currency_code)
    if budget_min_usd < MIN_BUDGET:
        log(f"Project {pid} skipped: Budget {currency_code} {budget_min} (${budget_min_usd:.2f} USD) < ${MIN_BUDGET}")
        return False
    
    if bids_so_far >= 25:
        log(f"Project {pid} skipped: Too many bids ({bids_so_far} >= 25)")
        return False
    
    # Get required skills from project
    required_skills = [j.get('name', '').lower().strip() for j in p.get('jobs', [])]
    
    # Get user's skills
    user_skills = get_user_skills()
    
    # If project has no required skills, check title/description for keywords
    if not required_skills:
        title_lower = title.lower()
        desc_lower = p.get('description', '').lower()
        combined_text = f"{title_lower} {desc_lower}"
        
        # Check if any user skill appears in title or description
        for user_skill in user_skills:
            if user_skill in combined_text:
                log(f"Project {pid} MATCHED (no skills listed, but found '{user_skill}' in text)")
                return True
        
        log(f"Project {pid} skipped: No skills listed and no skill keywords found in title/description")
        return False
    
    # Check if AT LEAST ONE required skill matches user's skills
    # This is more flexible - we only need one skill match, not all
    matched_skills = []
    missing_skills = []
    
    for req_skill in required_skills:
        if not req_skill:
            continue
        # Check if any user skill matches (exact or contains)
        skill_matches = False
        matched_user_skill = None
        for user_skill in user_skills:
            # Exact match
            if req_skill == user_skill:
                skill_matches = True
                matched_user_skill = user_skill
                break
            # Partial match (skill name contains or is contained)
            if req_skill in user_skill or user_skill in req_skill:
                skill_matches = True
                matched_user_skill = user_skill
                break
            # Also check for common variations (e.g., "next.js" vs "nextjs")
            req_normalized = req_skill.replace('.', '').replace(' ', '').replace('-', '')
            user_normalized = user_skill.replace('.', '').replace(' ', '').replace('-', '')
            if req_normalized == user_normalized:
                skill_matches = True
                matched_user_skill = user_skill
                break
        
        if skill_matches:
            matched_skills.append(f"{req_skill} (matched: {matched_user_skill})")
        else:
            missing_skills.append(req_skill)
    
    # If at least one skill matches, we're good
    if matched_skills:
        log(f"Project {pid} MATCHED: Skills matched: {', '.join(matched_skills[:2])}{'...' if len(matched_skills) > 2 else ''}")
        if missing_skills:
            log(f"  (Also requires: {', '.join(missing_skills[:2])}{'...' if len(missing_skills) > 2 else ''} - but we have at least one match)")
        return True
    
    # No skills matched
    log(f"Project {pid} skipped: No matching skills. Required: {', '.join(required_skills[:3])}{'...' if len(required_skills) > 3 else ''} | Title: {title}")
    log(f"  Your skills: {', '.join(user_skills[:5])}{'...' if len(user_skills) > 5 else ''}")
    return False

def get_prompt_hash():
    """Generate a hash of the current prompt template for tracking"""
    return hashlib.md5(PROMPT_TEMPLATE.encode('utf-8')).hexdigest()[:16]

def get_all_prompts():
    """Get all prompts from the database"""
    try:
        with _db_lock:
            db_conn = get_db_connection()
            try:
                db_c = db_conn.cursor()
                db_c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='prompts'")
                if db_c.fetchone():
                    db_c.execute("SELECT id, name, description, template FROM prompts")
                    rows = db_c.fetchall()
                    return [{'id': row[0], 'name': row[1], 'description': row[2], 'template': row[3]} for row in rows]
            finally:
                db_conn.close()
    except Exception as e:
        log(f"Error loading prompts: {e}")
    return []

def select_best_prompt(project):
    """Use AI to intelligently select the best prompt for this project"""
    try:
        prompts = get_all_prompts()
        if not prompts:
            # Fallback to active prompt or default
            return load_active_prompt(), get_active_prompt_id()
        
        # Build project context for AI analysis
        title = project.get('title', '')
        description = project.get('description', '')[:2000]  # Limit for context
        skills_list = ", ".join([j['name'] for j in project.get('jobs', [])])
        budget_min = project.get('budget', {}).get('minimum', 0)
        budget_max = project.get('budget', {}).get('maximum', 0) or "open"
        
        # Build prompt selection prompt
        prompts_summary = "\n\n".join([
            f"{i+1}. {p['name']}: {p['description']}" 
            for i, p in enumerate(prompts)
        ])
        
        selection_prompt = f"""You are an expert at matching project requirements to the most effective bid strategy.

PROJECT DETAILS:
Title: {title}
Description: {description}
Skills: {skills_list}
Budget: ${budget_min}–${budget_max}

AVAILABLE PROMPT STRATEGIES:
{prompts_summary}

Your task: Analyze the project and select the SINGLE BEST prompt strategy (by number 1-{len(prompts)}) that will maximize reply rate and win probability.

Consider:
- Project complexity and scope
- Client language and tone (technical vs. business vs. non-technical)
- Budget level and project type
- Specific keywords and requirements mentioned
- Whether it's a new build, fix, integration, or consultation

Respond with ONLY the number (1-{len(prompts)}) of the best prompt strategy. No explanation, just the number."""
        
        response = model.generate_content(selection_prompt)
        selected_num = None
        try:
            # Extract number from response
            response_text = response.text.strip()
            # Find first number in response
            numbers = re.findall(r'\d+', response_text)
            if numbers:
                selected_num = int(numbers[0])
                if 1 <= selected_num <= len(prompts):
                    selected_prompt = prompts[selected_num - 1]
                    log(f"AI selected prompt: {selected_prompt['name']} (ID: {selected_prompt['id']})")
                    return selected_prompt['template'], selected_prompt['id']
        except Exception as e:
            log(f"Error parsing AI prompt selection: {e}, using fallback")
        
        # Fallback: Use active prompt or first prompt
        active_id = get_active_prompt_id()
        if active_id:
            for p in prompts:
                if p['id'] == active_id:
                    return p['template'], active_id
        
        # Last resort: use first prompt
        return prompts[0]['template'], prompts[0]['id']
        
    except Exception as e:
        log(f"Error in prompt selection: {e}, using fallback")
        # Fallback to active prompt
        return load_active_prompt(), get_active_prompt_id()

def get_active_prompt_id():
    """Get the ID of the currently active prompt"""
    try:
        with _db_lock:
            db_conn = get_db_connection()
            try:
                db_c = db_conn.cursor()
                db_c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='prompts'")
                if db_c.fetchone():
                    db_c.execute("SELECT id FROM prompts WHERE is_active = 1 LIMIT 1")
                    result = db_c.fetchone()
                    if result:
                        return result[0]
            finally:
                db_conn.close()
    except:
        pass
    return None

def generate_message(p):
    """Generate bid message using prompt selection mode (manual or dynamic)"""
    try:
        # Check prompt selection mode from config
        # Since we use 'from config import *', PROMPT_SELECTION_MODE should be available
        # Default to 'dynamic' if not set
        prompt_mode = globals().get('PROMPT_SELECTION_MODE', 'dynamic')
        
        if prompt_mode == 'manual':
            # Manual mode: Use the active prompt only
            selected_template = load_active_prompt()
            selected_prompt_id = get_active_prompt_id()
            log(f"Manual mode: Using active prompt (ID: {selected_prompt_id})")
        else:
            # Dynamic mode: Intelligently select the best prompt for this project
            selected_template, selected_prompt_id = select_best_prompt(p)
        
        # Get project age for prompt
        time_submitted = p.get('time_submitted') or p.get('submitdate') or p.get('time_created')
        age_text = "just posted"
        if time_submitted:
            try:
                if isinstance(time_submitted, str):
                    from datetime import datetime
                    dt = datetime.fromisoformat(time_submitted.replace('Z', '+00:00'))
                    age_seconds = time.time() - dt.timestamp()
                    age_minutes = int(age_seconds / 60)
                    if age_minutes < 2:
                        age_text = "posted less than 2 minutes ago"
                    elif age_minutes < 5:
                        age_text = f"posted {age_minutes} minutes ago"
                    else:
                        age_text = f"posted {age_minutes} minutes ago"
            except:
                pass
        
        # Format the selected prompt template
        filled = selected_template.format(
            project_title=p['title'],
            full_description=p.get('description', '')[:3000],
            budget_min=p.get('budget', {}).get('minimum', 0),
            budget_max=p.get('budget', {}).get('maximum', 0) or "open",
            skills_list=", ".join([j['name'] for j in p.get('jobs', [])])
        ).replace("posted less than 2 minutes ago", age_text)
        
        response = model.generate_content(filled)
        message = response.text.strip()
        
        # Store the selected prompt_id for this message generation
        # We'll use this in the bid() function
        p['_selected_prompt_id'] = selected_prompt_id
        
        return message
    except Exception as e:
        log(f"Gemini failed: {e}")
        return "I just saw your project and already have a clear plan to deliver exactly what you need. What's the one feature you're most excited about?"

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

def bid(project):
    pid = project['id']
    start_time = time.time()
    amount = calc_bid_amount(project)
    msg = generate_message(project)
    
    # Get the selected prompt_id from generate_message (stored in project dict)
    selected_prompt_id = project.get('_selected_prompt_id')
    
    try:
        log(f"Attempting to bid on project {pid}: {project['title'][:60]}")
        place_project_bid(
            Session(oauth_token=OAUTH_TOKEN),
            project_id=pid,
            bidder_id=YOUR_BIDDER_ID,
            amount=amount,
            period=DEFAULT_DELIVERY_DAYS,
            description=msg,
            milestone_percentage=50,  # <-- THIS WAS MISSING (50% default milestone)
        )
        bid_time = time.time() - start_time
        
        # Use thread-safe database connection
        # Get prompt hash from selected template
        prompt_hash = None
        if selected_prompt_id:
            try:
                with _db_lock:
                    db_conn = get_db_connection()
                    try:
                        db_c = db_conn.cursor()
                        db_c.execute("SELECT template FROM prompts WHERE id = ?", (selected_prompt_id,))
                        result = db_c.fetchone()
                        if result:
                            prompt_hash = hashlib.md5(result[0].encode('utf-8')).hexdigest()[:16]
                    finally:
                        db_conn.close()
            except:
                pass
        
        # Fallback to default hash if needed
        if not prompt_hash:
            prompt_hash = get_prompt_hash()
        
        with _db_lock:
            db_conn = get_db_connection()
            try:
                db_c = db_conn.cursor()
                # Get currency code from project - try multiple possible structures
                budget_data = project.get('budget', {})
                currency_code = 'USD'  # Default
                
                # Try different ways the currency might be structured in the API response
                if isinstance(budget_data.get('currency'), dict):
                    currency_code = budget_data.get('currency', {}).get('code', 'USD')
                elif isinstance(budget_data.get('currency'), str):
                    currency_code = budget_data.get('currency', 'USD')
                elif budget_data.get('currency_code'):
                    currency_code = budget_data.get('currency_code', 'USD')
                elif project.get('currency'):
                    if isinstance(project.get('currency'), dict):
                        currency_code = project.get('currency', {}).get('code', 'USD')
                    else:
                        currency_code = project.get('currency', 'USD')
                elif project.get('currency_code'):
                    currency_code = project.get('currency_code', 'USD')
                
                # Use REPLACE instead of IGNORE to update existing bids
                db_c.execute("INSERT OR REPLACE INTO bids (project_id, title, bid_amount, applied_at, bid_message, prompt_hash, currency_code, prompt_id) VALUES (?,?,?,datetime('now'),?,?,?,?)",
                          (pid, project['title'], amount, msg, prompt_hash, currency_code, selected_prompt_id))
                
                # Update prompt stats if prompt_id exists
                if selected_prompt_id:
                    try:
                        db_c.execute("UPDATE prompts SET stats_bids = stats_bids + 1 WHERE id = ?", (selected_prompt_id,))
                    except:
                        pass  # Table might not exist yet
                
                db_conn.commit()
            finally:
                db_conn.close()
        notify(f"BID PLACED → {project['title'][:50]} | ${amount} | ID: {pid}")
        log(f"BID SUCCESS → {pid} | ${amount} | {project['title'][:60]} | Time: {bid_time:.1f}s")
    except Exception as e:
        log(f"Bid failed on {pid}: {e}")

# === CLI COMMANDS ===
if len(sys.argv) > 1:
    if sys.argv[1] == "--view":
        db_conn = get_db_connection()
        try:
            db_c = db_conn.cursor()
            for row in db_c.execute("SELECT * FROM bids ORDER BY applied_at DESC LIMIT 50"):
                print(row)
        finally:
            db_conn.close()
    elif sys.argv[1] == "--cost" and len(sys.argv) == 4:
        pid, cost = int(sys.argv[2]), float(sys.argv[3])
        db_conn = get_db_connection()
        try:
            db_c = db_conn.cursor()
            db_c.execute("SELECT bid_amount FROM bids WHERE project_id=?", (pid,))
            row = db_c.fetchone()
            if row:
                profit = row[0] - cost
                db_c.execute("UPDATE bids SET status='won', outsource_cost=?, profit=? WHERE project_id=?", (cost, profit, pid))
                db_conn.commit()
                notify(f"WIN UPDATED → ID {pid} | Cost ${cost} | Profit ${profit}")
                print(f"Updated {pid}: Profit ${profit}")
        finally:
            db_conn.close()
    sys.exit(0)

# === MAIN LOOP ===
seen = {}  # Changed to dict: {project_id: timestamp}
SEEN_EXPIRY_SECONDS = 3600  # Re-check projects after 1 hour (bid counts might change)
MAX_SEEN_SIZE = 500
log("=" * 60)
log("AUTOBIDDER STARTED — Press Ctrl+C to stop")
log("=" * 60)
# Initialize user skills at startup
get_user_skills()
log("")

# Rate limiting state
rate_limit_backoff = 0  # Current backoff multiplier
consecutive_rate_limits = 0  # Count of consecutive rate limits
MAX_BACKOFF_MULTIPLIER = 20  # Maximum backoff: 20 * POLL_INTERVAL
BACKOFF_RESET_THRESHOLD = 3  # Reset backoff after this many successful requests

try:
    while True:
        current_time = time.time()
        # Clean up expired entries
        expired = [pid for pid, ts in seen.items() if current_time - ts > SEEN_EXPIRY_SECONDS]
        for pid in expired:
            del seen[pid]
        if expired:
            log(f"Expired {len(expired)} old project entries (re-checking them now)")
        
        log(f"Scanning for new projects... (tracking: {len(seen)})")
        matching_count = 0
        skipped_count = 0
        new_projects = 0
        already_seen = 0
        
        projects, is_rate_limited = get_projects()
        
        # Handle rate limiting with exponential backoff
        if is_rate_limited:
            consecutive_rate_limits += 1
            # Exponential backoff: 2^consecutive_rate_limits, capped at MAX_BACKOFF_MULTIPLIER
            rate_limit_backoff = min(2 ** consecutive_rate_limits, MAX_BACKOFF_MULTIPLIER)
            sleep_time = POLL_INTERVAL * rate_limit_backoff
            log(f"⚠️  Rate limited! Backing off: {sleep_time} seconds (backoff multiplier: {rate_limit_backoff}x)")
        else:
            # Successful request - reset backoff if we had consecutive failures
            if consecutive_rate_limits > 0:
                consecutive_rate_limits = max(0, consecutive_rate_limits - BACKOFF_RESET_THRESHOLD)
                if consecutive_rate_limits == 0:
                    rate_limit_backoff = 0
                    log("✅ Rate limit cleared, returning to normal polling")
        
        # Process projects only if we got them (not rate limited)
        if projects:
            for p in projects:
                pid = p['id']
                if pid not in seen:
                    new_projects += 1
                    if good_project(p):
                        matching_count += 1
                        log(f"✓ MATCHING PROJECT: {pid} - {p['title'][:50]}")
                        # Run bid in background thread to not block scanning
                        threading.Thread(target=bid, args=(p,), daemon=True).start()
                    else:
                        skipped_count += 1
                    seen[pid] = current_time
                else:
                    already_seen += 1
                    
                # Limit seen dict size to prevent memory issues
                if len(seen) > MAX_SEEN_SIZE:
                    # Remove oldest 20% of entries
                    sorted_seen = sorted(seen.items(), key=lambda x: x[1])
                    to_remove = sorted_seen[:int(MAX_SEEN_SIZE * 0.2)]
                    for pid, _ in to_remove:
                        del seen[pid]
                    log(f"Trimmed seen set to {len(seen)} projects (removed {len(to_remove)} oldest)")
            
            if new_projects == 0:
                log(f"No new projects found ({already_seen} already seen)")
            elif matching_count > 0:
                log(f"Found {new_projects} new projects: {matching_count} matched, {skipped_count} skipped")
            elif skipped_count > 0:
                log(f"Found {new_projects} new projects: {matching_count} matched, {skipped_count} skipped")
        
        # Calculate sleep time based on rate limiting
        if is_rate_limited:
            sleep_time = POLL_INTERVAL * rate_limit_backoff
        else:
            sleep_time = POLL_INTERVAL
        
        log(f"Sleeping for {sleep_time} seconds...")
        time.sleep(sleep_time)
except KeyboardInterrupt:
    log("=" * 60)
    log("AUTOBIDDER STOPPED by user")
    log("=" * 60)
except Exception as e:
    log(f"FATAL ERROR: {e}")
    raise