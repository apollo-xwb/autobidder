# config.py — FILL THESE 6 LINES ONLY

OAUTH_TOKEN = "U0PjAxqrGkyNJZzqf3dcgo4JFMR5Z0"
YOUR_BIDDER_ID = 27704945
GEMINI_API_KEY = "AIzaSyC0vrcJEtip6k_JEypEidEeXWTwQA7LZsc"
TELEGRAM_TOKEN = "8333817581:AAGfS5ArOFgLWRTeEuiH37NDWmY7tfKb0Is"
TELEGRAM_CHAT_ID = "608499915"

# Bid settings
MIN_BUDGET = 200
POLL_INTERVAL = 30  # Increased from 3 to 30 seconds to reduce API rate limiting
BID_AMOUNT_MULTIPLIER = 1.05
DEFAULT_DELIVERY_DAYS = 6
MAX_PROJECT_AGE_MINUTES = 10

# Prompt selection mode: 'manual' = use active prompt only, 'dynamic' = AI selects best prompt per project
PROMPT_SELECTION_MODE = "dynamic"

# Your skills (list of skill names as they appear on Freelancer)
# If empty, will try to fetch from your profile automatically
MY_SKILLS = [
    'PHP',
    'JavaScript',
    'Python',
    'Data Entry',
    'Mobile App Development',
    'iPhone',
    'Android',
    'SQL',
    'WordPress',
    'CSS',
    'Marketing',
    'Azure',
    'MySQL',
    'HTML5',
    'HTML',
    'Node.js',
    'Shopify',
    'Game Development',
    'SQLite',
    'AngularJS',
    'React.js',
    'Augmented Reality',
    'Typescript',
    'Blockchain',
    'Web Development',
    'Data Analytics',
    'React Native',
    'Flutter',
    'Google Firebase',
    'Lead Generation',
    'Three.js',
    'Unity',
    'Next.js',
]
