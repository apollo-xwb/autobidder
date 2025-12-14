#!/usr/bin/env python3
"""
API Server for Autobidder Mobile App
Provides REST API to interact with autobidder configuration and data
"""
import json
import sqlite3
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import threading
import time

# Try to import config, but don't fail if it doesn't exist
try:
from config import *
except ImportError:
    # Config will be read from file instead
    pass

# Import Freelancer SDK for fetching bids
try:
    from freelancersdk.session import Session
    from freelancersdk.resources.projects import get_bids, get_projects
    FREELANCER_SDK_AVAILABLE = True
except ImportError:
    FREELANCER_SDK_AVAILABLE = False

app = Flask(__name__)
CORS(app)  # Enable CORS for React Native

# Global state
autobidder_process = None
autobidder_running = False
autobidder_logs = []
LOG_FILE = 'autobidder.log'
MAX_LOG_LINES = 1000

# Database connections
BIDS_DB = 'bids.db'
CONFIG_FILE = 'config.py'

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
        'THB': 0.028,
        'IDR': 0.000064,
        'MYR': 0.21,
        'PHP': 0.018,
        'VND': 0.000041,
        'KRW': 0.00075,
        'TRY': 0.031,
        'ILS': 0.27,
        'RUB': 0.011,
    }
    
    rate = conversion_rates.get(currency_code.upper(), 1.0)
    return amount * rate

def init_prompts_table():
    """Initialize prompts table for arsenal"""
    conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS prompts 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  name TEXT NOT NULL,
                  description TEXT,
                  template TEXT NOT NULL,
                  is_active INTEGER DEFAULT 0,
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                  stats_bids INTEGER DEFAULT 0,
                  stats_replies INTEGER DEFAULT 0,
                  stats_won INTEGER DEFAULT 0)''')
    # Migrate: Add description column if it doesn't exist
    try:
        c.execute("ALTER TABLE prompts ADD COLUMN description TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # Column already exists
    conn.commit()
    conn.close()

def read_config_file():
    """Read config.py and parse it"""
    config = {}
    try:
        # Try using exec to parse the config file as Python code (more reliable for lists)
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                code = f.read()
            # Create a safe namespace
            namespace = {}
            exec(code, namespace)
            # Extract config variables (skip built-ins and imports)
            builtins = set(dir(__builtins__)) if hasattr(__builtins__, '__dict__') else set()
            for key, value in namespace.items():
                if not key.startswith('_') and key not in builtins:
                    config[key] = value
            # If we successfully got MY_SKILLS, return early
            if 'MY_SKILLS' in config:
                return config
        except Exception as exec_error:
            print(f"Warning: Could not parse config with exec: {exec_error}")
            # Fall back to manual parsing
        
        # Fallback: Manual parsing (original method)
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            # Skip comments and empty lines
            if not line or line.startswith('#'):
                i += 1
                continue
            
                if '=' in line and not line.startswith('#'):
                    parts = line.split('=', 1)
                    if len(parts) == 2:
                        key = parts[0].strip()
                        value = parts[1].strip()
                    
                    # Remove inline comments (everything after #, but not if # is inside quotes)
                    if '#' in value:
                        # Simple approach: find first # that's not inside quotes
                        in_single_quote = False
                        in_double_quote = False
                        comment_pos = -1
                        for i, char in enumerate(value):
                            if char == "'" and (i == 0 or value[i-1] != '\\'):
                                in_single_quote = not in_single_quote
                            elif char == '"' and (i == 0 or value[i-1] != '\\'):
                                in_double_quote = not in_double_quote
                            elif char == '#' and not in_single_quote and not in_double_quote:
                                comment_pos = i
                                break
                        if comment_pos >= 0:
                            value = value[:comment_pos].strip()
                
                    # Handle multiline lists
                    if value.startswith('['):
                        # Collect all lines until we find the closing bracket
                        list_content = value
                        bracket_count = list_content.count('[') - list_content.count(']')
                        if bracket_count > 0:  # Not closed on same line
                            i += 1
                            while i < len(lines):
                                next_line = lines[i].strip()
                                # Skip comments
                                if next_line.startswith('#'):
                                    i += 1
                                    continue
                                list_content += ' ' + next_line
                                bracket_count += next_line.count('[') - next_line.count(']')
                                if bracket_count <= 0:  # Found closing bracket
                                    break
                                i += 1
                        # Parse the list safely
                        try:
                            # Extract items between brackets
                            start = list_content.find('[')
                            end = list_content.rfind(']')
                            if start != -1 and end != -1:
                                list_str = list_content[start+1:end]
                                # Split by comma and clean up, handling multiline
                                items = []
                                # Handle items that might span multiple lines
                                current_item = ''
                                in_quotes = False
                                quote_char = None
                                for char in list_str:
                                    if char in ("'", '"') and (not current_item or current_item[-1] != '\\'):
                                        if not in_quotes:
                                            in_quotes = True
                                            quote_char = char
                                        elif char == quote_char:
                                            in_quotes = False
                                            quote_char = None
                                        current_item += char
                                    elif char == ',' and not in_quotes:
                                        # End of item
                                        item = current_item.strip()
                        # Remove quotes
                                        if (item.startswith("'") and item.endswith("'")) or (item.startswith('"') and item.endswith('"')):
                                            item = item[1:-1]
                                        if item:
                                            items.append(item)
                                        current_item = ''
                                    else:
                                        current_item += char
                                # Add last item if any
                                if current_item.strip():
                                    item = current_item.strip()
                                    if (item.startswith("'") and item.endswith("'")) or (item.startswith('"') and item.endswith('"')):
                                        item = item[1:-1]
                                    if item:
                                        items.append(item)
                                config[key] = items
                        except Exception as e:
                            print(f"Error parsing list for {key}: {e}")
                            import traceback
                            traceback.print_exc()
                            config[key] = []
                    # Remove quotes for strings
                    elif value.startswith('"') and value.endswith('"'):
                        config[key] = value[1:-1]
                        elif value.startswith("'") and value.endswith("'"):
                        config[key] = value[1:-1]
                        # Handle numbers
                        elif value.isdigit():
                        config[key] = int(value)
                    elif '.' in value and value.replace('.', '').replace('-', '').isdigit():
                        config[key] = float(value)
                    else:
                        config[key] = value
            i += 1
    except Exception as e:
        print(f"Error reading config: {e}")
        import traceback
        traceback.print_exc()
    return config

def write_config_file(config):
    """Write config back to config.py"""
    try:
        # Read existing file to preserve comments
        with open(CONFIG_FILE, 'r') as f:
            lines = f.readlines()
        
        # Update values
        new_lines = []
        i = 0
        skip_until_bracket_close = False
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()
            
            # If we're skipping lines (inside a list), check for closing bracket
            if skip_until_bracket_close:
                if ']' in stripped:
                    skip_until_bracket_close = False
                    # Skip this line (the closing bracket) - we'll write our own
                    i += 1
                    continue
                else:
                    # Skip this line (it's part of the old list)
                    i += 1
                    continue
            
            if '=' in stripped and not stripped.startswith('#'):
                key = stripped.split('=')[0].strip()
                if key in config:
                    value = config[key]
                    if isinstance(value, str):
                        new_lines.append(f"{key} = \"{value}\"\n")
                    elif isinstance(value, list):
                        # Format list nicely with each item on a new line
                        if len(value) == 0:
                            new_lines.append(f"{key} = []\n")
                        else:
                            new_lines.append(f"{key} = [\n")
                            for item in value:
                                new_lines.append(f"    '{item}',\n")
                            new_lines.append("]\n")
                        # Check if the original line starts a multiline list
                        value_part = stripped.split('=', 1)[1].strip() if '=' in stripped else ''
                        if value_part.startswith('[') and not value_part.endswith(']'):
                            # This is a multiline list - skip until we find the closing bracket
                            skip_until_bracket_close = True
                    else:
                        new_lines.append(f"{key} = {value}\n")
                    # Remove from config so we know it's been written
                    del config[key]
                else:
                    new_lines.append(line)
            else:
                new_lines.append(line)
            i += 1
        
        # Add any new config values that weren't in the file
        for key, value in config.items():
            if isinstance(value, str):
                new_lines.append(f"{key} = \"{value}\"\n")
            elif isinstance(value, list):
                if len(value) == 0:
                    new_lines.append(f"{key} = []\n")
                else:
                    new_lines.append(f"{key} = [\n")
                    for item in value:
                        new_lines.append(f"    '{item}',\n")
                    new_lines.append("]\n")
            else:
                new_lines.append(f"{key} = {value}\n")
        
        with open(CONFIG_FILE, 'w') as f:
            f.writelines(new_lines)
        return True
    except Exception as e:
        print(f"Error writing config: {e}")
        return False

def read_prompt_template():
    """Read prompt template from autobidder.py"""
    try:
        with open('autobidder.py', 'r', encoding='utf-8') as f:
            content = f.read()
            # Extract PROMPT_TEMPLATE
            start = content.find('PROMPT_TEMPLATE = """')
            if start != -1:
                start += len('PROMPT_TEMPLATE = """')
                end = content.find('"""', start)
                if end != -1:
                    return content[start:end]
            # Try alternative format with triple single quotes
            start = content.find("PROMPT_TEMPLATE = '''")
            if start != -1:
                start += len("PROMPT_TEMPLATE = '''")
                end = content.find("'''", start)
                if end != -1:
                    return content[start:end]
    except Exception as e:
        print(f"Error reading prompt: {e}")
        import traceback
        traceback.print_exc()
    return ""

def write_prompt_template(template):
    """Write prompt template to autobidder.py"""
    try:
        with open('autobidder.py', 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Replace PROMPT_TEMPLATE
        start = content.find('PROMPT_TEMPLATE = """')
        if start != -1:
            start += len('PROMPT_TEMPLATE = """')
            end = content.find('"""', start)
            if end != -1:
                new_content = content[:start] + template + content[end:]
                with open('autobidder.py', 'w', encoding='utf-8') as f:
                    f.write(new_content)
                return True
        # Try alternative format
        start = content.find("PROMPT_TEMPLATE = '''")
        if start != -1:
            start += len("PROMPT_TEMPLATE = '''")
            end = content.find("'''", start)
            if end != -1:
                new_content = content[:start] + template + content[end:]
                with open('autobidder.py', 'w', encoding='utf-8') as f:
                    f.write(new_content)
                return True
    except Exception as e:
        print(f"Error writing prompt: {e}")
        import traceback
        traceback.print_exc()
    return False

@app.route('/config', methods=['GET'])
def get_config():
    """Get current configuration"""
    try:
    config = read_config_file()
        # Ensure MY_SKILLS is always a list
        if 'MY_SKILLS' not in config or not isinstance(config.get('MY_SKILLS'), list):
            config['MY_SKILLS'] = []
        # Ensure PROMPT_SELECTION_MODE has a default
        if 'PROMPT_SELECTION_MODE' not in config:
            config['PROMPT_SELECTION_MODE'] = 'dynamic'
    return jsonify(config)
    except Exception as e:
        import traceback
        error_msg = str(e)
        traceback_str = traceback.format_exc()
        print(f"Error in get_config: {error_msg}")
        print(traceback_str)
        return jsonify({'error': error_msg, 'traceback': traceback_str if app.debug else None}), 500

@app.route('/config', methods=['POST'])
def update_config():
    """Update configuration"""
    try:
    data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
    current_config = read_config_file()
    current_config.update(data)
        
    if write_config_file(current_config):
        return jsonify({'success': True, 'config': current_config})
        else:
            return jsonify({'success': False, 'error': 'Failed to write config file'}), 500
    except Exception as e:
        import traceback
        error_msg = str(e)
        traceback_str = traceback.format_exc()
        print(f"Error in update_config: {error_msg}")
        print(traceback_str)
        return jsonify({
            'success': False, 
            'error': error_msg,
            'traceback': traceback_str if app.debug else None
        }), 500

@app.route('/prompts', methods=['GET'])
def get_prompts():
    """Get all prompts from arsenal"""
    try:
        init_prompts_table()
        # Sync stats before returning
        sync_prompt_stats()
        
        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        c.execute("SELECT id, name, description, template, is_active, created_at, updated_at, stats_bids, stats_replies, stats_won FROM prompts ORDER BY is_active DESC, created_at DESC")
        rows = c.fetchall()
        conn.close()
        
        prompts = []
        for row in rows:
            prompts.append({
                'id': row[0],
                'name': row[1],
                'description': row[2],
                'template': row[3],
                'is_active': bool(row[4]),
                'created_at': row[5],
                'updated_at': row[6],
                'stats_bids': row[7] or 0,
                'stats_replies': row[8] or 0,
                'stats_won': row[9] or 0
            })
        return jsonify(prompts)
    except Exception as e:
        import traceback
        error_msg = str(e)
        traceback_str = traceback.format_exc()
        print(f"Error in get_prompts: {error_msg}")
        print(traceback_str)
        return jsonify({'error': error_msg, 'traceback': traceback_str if app.debug else None}), 500

@app.route('/prompts', methods=['POST'])
def create_prompt():
    """Create a new prompt in arsenal"""
    try:
        data = request.json
        name = data.get('name', '').strip()
        description = data.get('description', '').strip() or None
        template = data.get('template', '').strip()
        
        if not name or not template:
            return jsonify({'error': 'Name and template are required'}), 400
        
        init_prompts_table()
        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        c.execute("INSERT INTO prompts (name, description, template, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
                 (name, description, template))
        prompt_id = c.lastrowid
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'id': prompt_id})
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/prompts/<int:prompt_id>', methods=['PUT'])
def update_prompt_arsenal(prompt_id):
    """Update a prompt in arsenal"""
    try:
        data = request.json
        name = data.get('name', '').strip()
        description = data.get('description', '').strip() or None
        template = data.get('template', '').strip()
        
        init_prompts_table()
        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        
        # Build update query based on what's provided
        updates = []
        params = []
        
        if name:
            updates.append("name = ?")
            params.append(name)
        if description is not None:
            updates.append("description = ?")
            params.append(description)
        if template:
            updates.append("template = ?")
            params.append(template)
        
        if updates:
            updates.append("updated_at = datetime('now')")
            params.append(prompt_id)
            c.execute(f"UPDATE prompts SET {', '.join(updates)} WHERE id = ?", params)
        
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/prompts/<int:prompt_id>/activate', methods=['POST'])
def activate_prompt(prompt_id):
    """Activate a prompt (set as active and update autobidder.py)"""
    try:
        init_prompts_table()
        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        
        # Get the prompt template
        c.execute("SELECT template FROM prompts WHERE id = ?", (prompt_id,))
        result = c.fetchone()
        if not result:
            conn.close()
            return jsonify({'error': 'Prompt not found'}), 404
        
        template = result[0]
        
        # Deactivate all prompts
        c.execute("UPDATE prompts SET is_active = 0")
        
        # Activate this prompt
        c.execute("UPDATE prompts SET is_active = 1 WHERE id = ?", (prompt_id,))
        conn.commit()
        conn.close()
        
        # Update autobidder.py with the new template
        if write_prompt_template(template):
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Failed to update autobidder.py'}), 500
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/prompts/<int:prompt_id>', methods=['DELETE'])
def delete_prompt(prompt_id):
    """Delete a prompt from arsenal"""
    try:
        init_prompts_table()
        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        c.execute("DELETE FROM prompts WHERE id = ?", (prompt_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/prompt', methods=['GET'])
def get_prompt():
    """Get current active prompt (for backward compatibility)"""
    try:
        init_prompts_table()
        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        c.execute("SELECT name, description, template FROM prompts WHERE is_active = 1 LIMIT 1")
        result = c.fetchone()
        conn.close()
        
        if result:
            return jsonify({'prompt': result[2], 'template': result[2], 'name': result[0], 'description': result[1]})
        else:
            # Fallback to reading from autobidder.py
    template = read_prompt_template()
            if not template:
                template = "You are an elite full-stack developer..."
            return jsonify({'prompt': template, 'template': template, 'name': None})
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

def init_prompt_metadata_table():
    """Initialize prompt_metadata table"""
    conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS prompt_metadata 
                 (prompt_hash TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)''')
    conn.commit()
    conn.close()

@app.route('/prompt', methods=['POST'])
def update_prompt():
    """Update current active prompt (for backward compatibility)"""
    import hashlib
    data = request.json
    template = data.get('prompt') or data.get('template', '')
    prompt_name = data.get('name', '').strip() if data.get('name') else None
    
    init_prompts_table()
    conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
    c = conn.cursor()
    
    description = data.get('description', '').strip() or None
    
    # Check if there's an active prompt
    c.execute("SELECT id FROM prompts WHERE is_active = 1 LIMIT 1")
    active = c.fetchone()
    
    if active:
        # Update existing active prompt
        if prompt_name:
            if description is not None:
                c.execute("UPDATE prompts SET template = ?, name = ?, description = ?, updated_at = datetime('now') WHERE id = ?",
                         (template, prompt_name, description, active[0]))
            else:
                c.execute("UPDATE prompts SET template = ?, name = ?, updated_at = datetime('now') WHERE id = ?",
                         (template, prompt_name, active[0]))
        else:
            if description is not None:
                c.execute("UPDATE prompts SET template = ?, description = ?, updated_at = datetime('now') WHERE id = ?",
                         (template, description, active[0]))
            else:
                c.execute("UPDATE prompts SET template = ?, updated_at = datetime('now') WHERE id = ?",
                         (template, active[0]))
    else:
        # Create new active prompt
        name = prompt_name or 'Default Prompt'
        c.execute("UPDATE prompts SET is_active = 0")  # Deactivate all
        c.execute("INSERT INTO prompts (name, description, template, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))",
                 (name, description, template))
    
    conn.commit()
    conn.close()
    
    if write_prompt_template(template):
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Failed to write prompt'}), 500

def fetch_bids_from_freelancer():
    """Fetch all bids from Freelancer API for the user"""
    if not FREELANCER_SDK_AVAILABLE:
        return []
    
    try:
        config = read_config_file()
        oauth_token = config.get('OAUTH_TOKEN')
        bidder_id = config.get('YOUR_BIDDER_ID')
        
        if not oauth_token or not bidder_id:
            return []
        
        session = Session(oauth_token=oauth_token)
        all_bids = []
        
        # Strategy: Get recent active projects and check for bids
        # Also try to get bids directly
        try:
            # Try to get bids with empty filters - might return user's bids
            bids_response = get_bids(session, project_ids=[], bid_ids=[], limit=100, offset=0)
            
            if bids_response and 'bids' in bids_response:
                bids_list = bids_response.get('bids', [])
                # Filter to only this user's bids
                user_bids = [b for b in bids_list if b.get('bidder_id') == bidder_id]
                all_bids.extend(user_bids)
                
                # If we got bids, try to get more in batches
                if len(bids_list) == 100:
                    offset = 100
                    for _ in range(10):  # Try up to 1000 bids
                        try:
                            more_bids = get_bids(session, project_ids=[], bid_ids=[], limit=100, offset=offset)
                            if not more_bids or 'bids' not in more_bids:
                                break
                            more_list = more_bids.get('bids', [])
                            if not more_list:
                                break
                            user_more = [b for b in more_list if b.get('bidder_id') == bidder_id]
                            all_bids.extend(user_more)
                            if len(more_list) < 100:
                                break
                            offset += 100
                        except:
                            break
        except Exception as e:
            print(f"Error fetching bids directly: {e}")
            # Fallback: try to get projects and check bids
            try:
                # Get recent projects and check bids
                from freelancersdk.resources.projects.helpers import build_get_projects_request_data
                query_data = build_get_projects_request_data(limit=200, offset=0)
                projects_response = get_projects(session, query_data)
                if projects_response and 'projects' in projects_response:
                    projects = projects_response.get('projects', [])
                    project_ids = [p.get('id') for p in projects if p.get('id')]
                    
                    # Get bids for these projects in batches
                    if project_ids:
                        for i in range(0, min(len(project_ids), 50), 10):  # Process 10 at a time
                            batch_ids = project_ids[i:i+10]
                            try:
                                bids_response = get_bids(session, project_ids=batch_ids, limit=100, offset=0)
                                if bids_response and 'bids' in bids_response:
                                    bids_list = bids_response.get('bids', [])
                                    user_bids = [b for b in bids_list if b.get('bidder_id') == bidder_id]
                                    all_bids.extend(user_bids)
                            except:
                                pass
            except Exception as e2:
                print(f"Error in fallback bid fetch: {e2}")
                import traceback
                traceback.print_exc()
        
        return all_bids
    except Exception as e:
        print(f"Error fetching bids from Freelancer: {e}")
        import traceback
        traceback.print_exc()
        return []

def sync_bids_with_freelancer():
    """Sync local database with Freelancer API bids"""
    try:
        freelancer_bids = fetch_bids_from_freelancer()
        if not freelancer_bids:
            print("No bids fetched from Freelancer API")
            return
        
        print(f"Fetched {len(freelancer_bids)} bids from Freelancer API")
        
        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        
        # Ensure table exists with all columns
        c.execute('''CREATE TABLE IF NOT EXISTS bids 
                     (project_id INTEGER PRIMARY KEY, title TEXT, bid_amount REAL, 
                      status TEXT DEFAULT 'applied', outsource_cost REAL, profit REAL, applied_at TEXT, bid_message TEXT, reply_count INTEGER DEFAULT 0)''')
        
        # Migrate: Add columns if they don't exist
        try:
            c.execute("ALTER TABLE bids ADD COLUMN bid_message TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("ALTER TABLE bids ADD COLUMN reply_count INTEGER DEFAULT 0")
            conn.commit()
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("ALTER TABLE bids ADD COLUMN prompt_hash TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("ALTER TABLE bids ADD COLUMN currency_code TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass
        
        # Get project details for bids that don't have titles
        config = read_config_file()
        oauth_token = config.get('OAUTH_TOKEN')
        session = None
        if oauth_token and FREELANCER_SDK_AVAILABLE:
            try:
                session = Session(oauth_token=oauth_token)
            except:
                pass
        
        synced_count = 0
        for bid in freelancer_bids:
            try:
                project_id = bid.get('project_id')
                if not project_id:
                    continue
                
                # Get bid amount - Freelancer API returns amount in the project's currency
                # We need to preserve the original amount, not convert it
                bid_amount = bid.get('amount') or bid.get('bid_amount', 0)
                # The amount from Freelancer is already in the correct currency
                # Get currency code from bid - try multiple possible structures
                currency_code = 'USD'  # Default
                
                # Try different ways the currency might be structured
                if isinstance(bid.get('currency'), dict):
                    currency_code = bid.get('currency', {}).get('code', 'USD')
                elif isinstance(bid.get('currency'), str):
                    currency_code = bid.get('currency', 'USD')
                elif bid.get('currency_code'):
                    currency_code = bid.get('currency_code', 'USD')
                # Also check project data if available
                elif bid.get('project'):
                    project_data = bid.get('project', {})
                    budget_data = project_data.get('budget', {})
                    if isinstance(budget_data.get('currency'), dict):
                        currency_code = budget_data.get('currency', {}).get('code', 'USD')
                    elif budget_data.get('currency_code'):
                        currency_code = budget_data.get('currency_code', 'USD')
                submitted_time = bid.get('submitted_on') or bid.get('time_submitted') or bid.get('created_time') or bid.get('submitted_time')
                
                # Get project title if we don't have it
                title = None
                bid_message = bid.get('description') or bid.get('message') or bid.get('bid_message') or ''
                
                # Check if bid already exists in DB
                c.execute("SELECT title, currency_code FROM bids WHERE project_id=?", (project_id,))
                existing = c.fetchone()
                
                if existing and existing[0]:
                    title = existing[0]
                    # If we have a non-USD currency already, keep it
                    if existing[1] and existing[1] != 'USD':
                        currency_code = existing[1]
                
                # ALWAYS try to fetch project details to get accurate currency
                # The bid amount from Freelancer is in the project's currency, so we MUST get the project currency
                if session:
                    try:
                        from freelancersdk.resources.projects.helpers import build_get_projects_request_data
                        query_data = build_get_projects_request_data(project_ids=[project_id])
                        projects_response = get_projects(session, query_data)
                        if projects_response and 'projects' in projects_response:
                            projects_list = projects_response.get('projects', [])
                            if projects_list:
                                project_data = projects_list[0]
                                if not title:
                                    title = project_data.get('title', f'Project {project_id}')
                                # ALWAYS extract currency from project (more reliable than bid data)
                                budget_data = project_data.get('budget', {})
                                if isinstance(budget_data.get('currency'), dict):
                                    currency_code = budget_data.get('currency', {}).get('code', 'USD')
                                elif budget_data.get('currency_code'):
                                    currency_code = budget_data.get('currency_code', 'USD')
                                elif isinstance(budget_data.get('currency'), str):
                                    currency_code = budget_data.get('currency', 'USD')
                                # Also check project level currency
                                if currency_code == 'USD' and project_data.get('currency'):
                                    if isinstance(project_data.get('currency'), dict):
                                        currency_code = project_data.get('currency', {}).get('code', 'USD')
                                    elif isinstance(project_data.get('currency'), str):
                                        currency_code = project_data.get('currency', 'USD')
                    except Exception as e:
                        print(f"Error fetching project {project_id} for currency: {e}")
                        if not title:
                            title = f'Project {project_id}'
                
                if not title:
                    title = f'Project {project_id}'
                
                # Check for reply count in bid data
                reply_count = bid.get('reply_count') or bid.get('message_count') or bid.get('replies') or 0
                
                # Insert or update bid (preserve existing status if it's 'won', preserve reply_count if higher)
                c.execute("SELECT status, reply_count, currency_code FROM bids WHERE project_id=?", (project_id,))
                existing_data = c.fetchone()
                status = 'applied'
                if existing_data and existing_data[0] == 'won':
                    status = 'won'
                # Keep the higher reply count (in case we're syncing and there are new replies)
                if existing_data and existing_data[1]:
                    reply_count = max(reply_count, existing_data[1])
                # Always prefer currency from project details (more reliable than bid data or existing DB value)
                # Only use existing currency if we didn't fetch project details and it's not USD
                if currency_code == 'USD' and existing_data and existing_data[2] and existing_data[2] != 'USD':
                    # If we didn't successfully fetch project details, keep existing non-USD currency
                    currency_code = existing_data[2]
                
                c.execute("""INSERT OR REPLACE INTO bids 
                            (project_id, title, bid_amount, status, applied_at, bid_message, reply_count, currency_code) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                         (project_id, title, bid_amount, status, submitted_time, bid_message, reply_count, currency_code))
                synced_count += 1
            except Exception as e:
                print(f"Error processing bid {bid.get('project_id')}: {e}")
                continue
        
        conn.commit()
        conn.close()
        print(f"Synced {synced_count} bids to database")
        
    except Exception as e:
        print(f"Error syncing bids: {e}")
        import traceback
        traceback.print_exc()

# Cache for last sync time to avoid too frequent API calls
_last_sync_time = 0
SYNC_INTERVAL_SECONDS = 300  # Sync every 5 minutes

@app.route('/bids', methods=['GET'])
@app.route('/api/bids', methods=['GET'])  # Also accept /api prefix
def get_bids():
    """Get all bids from database, synced with Freelancer API"""
    import sys
    global _last_sync_time
    try:
        # Sync with Freelancer API in background (but not too frequently)
        import time
        current_time = time.time()
        should_sync = (current_time - _last_sync_time) > SYNC_INTERVAL_SECONDS
        
        if should_sync:
            # Run sync in background thread to not block the request
            def sync_in_background():
                global _last_sync_time
                try:
                    sync_bids_with_freelancer()
                    _last_sync_time = time.time()
                except Exception as e:
                    print(f"Background sync error: {e}")
            
            threading.Thread(target=sync_in_background, daemon=True).start()
            _last_sync_time = current_time
        
        # Use a fresh connection each time to avoid caching issues
        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        
        # Migrate: Add columns if they don't exist
        try:
            c.execute("ALTER TABLE bids ADD COLUMN bid_message TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Column already exists
        try:
            c.execute("ALTER TABLE bids ADD COLUMN currency_code TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Column already exists
        
        # Check if currency_code column exists
        c.execute("PRAGMA table_info(bids)")
        columns = [col[1] for col in c.fetchall()]
        has_currency = 'currency_code' in columns
        
        # Check if reply_count column exists
        has_reply_count = 'reply_count' in columns
        
        # Check if prompt_id column exists
        has_prompt_id = 'prompt_id' in columns
        
        # Force a fresh read by using a transaction
        c.execute("BEGIN IMMEDIATE")
        
        # Build query with prompt name join if prompt_id exists
        if has_prompt_id:
            # Join with prompts table to get prompt name
            base_select = """SELECT b.project_id, b.title, b.bid_amount, b.status, b.outsource_cost, b.profit, 
                         b.applied_at, b.bid_message"""
            if has_reply_count:
                base_select += ", b.reply_count"
            if has_currency:
                base_select += ", b.currency_code"
            base_select += ", b.prompt_id, p.name as prompt_name"
            base_select += " FROM bids b LEFT JOIN prompts p ON b.prompt_id = p.id ORDER BY b.applied_at DESC"
            c.execute(base_select)
        elif has_currency and has_reply_count:
            # Explicitly select columns to ensure correct order
            # Don't use COALESCE - return NULL so frontend can handle it properly
            c.execute("""SELECT project_id, title, bid_amount, status, outsource_cost, profit, 
                         applied_at, bid_message, reply_count, currency_code 
                         FROM bids ORDER BY applied_at DESC""")
        elif has_currency:
            c.execute("""SELECT project_id, title, bid_amount, status, outsource_cost, profit, 
                         applied_at, bid_message, currency_code 
                         FROM bids ORDER BY applied_at DESC""")
        elif has_reply_count:
            c.execute("""SELECT project_id, title, bid_amount, status, outsource_cost, profit, 
                         applied_at, bid_message, reply_count 
                         FROM bids ORDER BY applied_at DESC""")
        else:
            # Fallback if currency_code and reply_count columns don't exist yet
            c.execute("""SELECT project_id, title, bid_amount, status, outsource_cost, profit, 
                         applied_at, bid_message 
                         FROM bids ORDER BY applied_at DESC""")
        rows = c.fetchall()
        c.execute("COMMIT")
        conn.close()
        
        bids = []
        for row in rows:
            bid_data = {
                'project_id': row[0],
                'title': row[1],
                'bid_amount': row[2],
                'status': row[3],
                'outsource_cost': row[4],
                'profit': row[5],
                'applied_at': row[6],
                'bid_message': row[7] if len(row) > 7 else None,
            }
            
            # Handle columns based on what exists
            col_idx = 8
            if has_prompt_id:
                # prompt_id and prompt_name are at the end
                if has_reply_count and has_currency:
                    # reply_count at 8, currency_code at 9, prompt_id at 10, prompt_name at 11
                    bid_data['reply_count'] = row[8] if len(row) > 8 and row[8] is not None else 0
                    bid_data['currency_code'] = row[9] if len(row) > 9 and row[9] else None
                    bid_data['prompt_id'] = row[10] if len(row) > 10 else None
                    bid_data['prompt_name'] = row[11] if len(row) > 11 else None
                elif has_reply_count:
                    # reply_count at 8, prompt_id at 9, prompt_name at 10
                    bid_data['reply_count'] = row[8] if len(row) > 8 and row[8] is not None else 0
                    bid_data['currency_code'] = None
                    bid_data['prompt_id'] = row[9] if len(row) > 9 else None
                    bid_data['prompt_name'] = row[10] if len(row) > 10 else None
                elif has_currency:
                    # currency_code at 8, prompt_id at 9, prompt_name at 10
                    bid_data['reply_count'] = 0
                    bid_data['currency_code'] = row[8] if len(row) > 8 and row[8] else None
                    bid_data['prompt_id'] = row[9] if len(row) > 9 else None
                    bid_data['prompt_name'] = row[10] if len(row) > 10 else None
                else:
                    # prompt_id at 8, prompt_name at 9
                    bid_data['reply_count'] = 0
                    bid_data['currency_code'] = None
                    bid_data['prompt_id'] = row[8] if len(row) > 8 else None
                    bid_data['prompt_name'] = row[9] if len(row) > 9 else None
            elif has_reply_count and has_currency:
                # Both columns exist: reply_count is at index 8, currency_code at index 9
                bid_data['reply_count'] = row[8] if len(row) > 8 and row[8] is not None else 0
                bid_data['currency_code'] = row[9] if len(row) > 9 and row[9] else None
                bid_data['prompt_id'] = None
                bid_data['prompt_name'] = None
            elif has_reply_count:
                # Only reply_count exists: it's at index 8
                bid_data['reply_count'] = row[8] if len(row) > 8 and row[8] is not None else 0
                bid_data['currency_code'] = None
                bid_data['prompt_id'] = None
                bid_data['prompt_name'] = None
            elif has_currency:
                # Only currency_code exists: it's at index 8
                bid_data['reply_count'] = 0
                bid_data['currency_code'] = row[8] if len(row) > 8 and row[8] else None
                bid_data['prompt_id'] = None
                bid_data['prompt_name'] = None
            else:
                # Neither column exists
                bid_data['reply_count'] = 0
                bid_data['currency_code'] = None
                bid_data['prompt_id'] = None
                bid_data['prompt_name'] = None
            bids.append(bid_data)
        return jsonify(bids)
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"ERROR in get_bids: {e}", file=sys.stderr)
        print(error_trace, file=sys.stderr)
        sys.stderr.flush()
        return jsonify({'error': str(e), 'traceback': error_trace}), 500

@app.route('/bids/sync', methods=['POST'])
@app.route('/api/bids/sync', methods=['POST'])  # Also accept /api prefix in case proxy isn't working
def sync_bids_now():
    """Manually trigger a sync with Freelancer API and update currency codes"""
    import sys
    # Use stderr which is unbuffered on Windows
    print("=" * 60, file=sys.stderr)
    print("SYNC BIDS ENDPOINT CALLED", file=sys.stderr)
    print(f"Request from: {request.remote_addr}", file=sys.stderr)
    print(f"Request path: {request.path}", file=sys.stderr)
    print(f"Request method: {request.method}", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    sys.stderr.flush()
    try:
        print("Step 1: Syncing bids with Freelancer API...")
        sync_bids_with_freelancer()
        print("Step 1: Complete")
        
        # Also update currency codes for bids that are missing them or have USD
        updated_count = 0
        try:
            print("Step 2: Opening database connection...")
            conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
            c = conn.cursor()
            
            # Get ALL bids to ensure currency codes are correct (especially NULL ones)
            # This ensures we update any incorrect or missing currency codes
            c.execute("SELECT project_id FROM bids WHERE currency_code IS NULL OR currency_code = 'USD'")
            project_ids = [row[0] for row in c.fetchall()]
            
            print(f"Step 2: Found {len(project_ids)} bids to update currency codes for", flush=True)
            if len(project_ids) == 0:
                print("No bids need currency code updates!", flush=True)
                conn.close()
                return jsonify({'success': True, 'message': 'All bids already have currency codes'})
            
            if not FREELANCER_SDK_AVAILABLE:
                print("ERROR: Freelancer SDK not available!", file=sys.stderr)
                sys.stderr.flush()
                conn.close()
                return jsonify({'success': False, 'error': 'Freelancer SDK not available'}), 500
            
            print("Step 3: Reading config and creating session...", file=sys.stderr)
            sys.stderr.flush()
            config = read_config_file()
            oauth_token = config.get('OAUTH_TOKEN')
            if not oauth_token:
                print("ERROR: No OAUTH_TOKEN in config!", file=sys.stderr)
                sys.stderr.flush()
                conn.close()
                return jsonify({'success': False, 'error': 'No OAUTH_TOKEN configured'}), 500
            
            if project_ids:
                try:
                    session = Session(oauth_token=oauth_token)
                    # Fetch project details in batches
                    for i in range(0, len(project_ids), 10):
                        batch_ids = project_ids[i:i+10]
                        try:
                            from freelancersdk.resources.projects.helpers import build_get_projects_request_data
                            query_data = build_get_projects_request_data(project_ids=batch_ids)
                            projects_response = get_projects(session, query_data)
                            if projects_response and 'projects' in projects_response:
                                projects_list = projects_response.get('projects', [])
                                print(f"  Found {len(projects_list)} projects in response")
                                for project in projects_list:
                                    project_id = project.get('id')
                                    if not project_id:
                                        continue
                                    
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
                                    
                                    # Debug: Print currency extraction (only for first few to avoid spam)
                                    if updated_count < 3:
                                        print(f"Project {project_id}: Extracted currency = {currency_code}")
                                        print(f"  Budget data keys: {list(budget_data.keys()) if budget_data else 'None'}")
                                        if budget_data:
                                            print(f"  Budget currency type: {type(budget_data.get('currency'))}")
                                            print(f"  Budget currency value: {budget_data.get('currency')}")
                                    
                                    # Always update currency code (even if USD, to ensure it's set)
                                    if currency_code:
                                        # Check current currency to see if we're updating
                                        c.execute("SELECT currency_code FROM bids WHERE project_id = ?", (project_id,))
                                        current_currency_row = c.fetchone()
                                        current_currency = current_currency_row[0] if current_currency_row else None
                                        
                                        # Always update if different (including NULL -> currency)
                                        if current_currency != currency_code:
                                            c.execute("UPDATE bids SET currency_code = ? WHERE project_id = ?", 
                                                     (currency_code, project_id))
                                            updated_count += 1
                                            if updated_count <= 10:  # Log first 10 updates
                                                print(f"  ✓ Updated project {project_id}: {current_currency or 'NULL'} -> {currency_code}")
                                        elif updated_count < 3:  # Log first few that don't need updates
                                            print(f"  - Project {project_id}: Already has currency {currency_code}")
                        except Exception as e:
                            print(f"Error updating currency for batch: {e}")
                            import traceback
                            traceback.print_exc()
                            continue
                    
                    conn.commit()
                    print(f"Step 5: Committed currency updates. Total updated: {updated_count}")
                except Exception as e:
                    print(f"ERROR in currency update: {e}")
                    import traceback
                    traceback.print_exc()
            else:
                print("ERROR: No project_ids to process")
            
            conn.close()
            print("Step 6: Database connection closed")
        except Exception as e:
            print(f"ERROR updating currencies: {e}")
            import traceback
            traceback.print_exc()
        
        message = f'Bids synced successfully'
        if updated_count > 0:
            message += f'. Updated {updated_count} currency codes.'
        print(f"SYNC COMPLETE: {message}")
        print("=" * 60)
        return jsonify({'success': True, 'message': message})
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"FATAL ERROR in sync_bids_now: {e}")
        print(error_trace)
        print("=" * 60)
        return jsonify({'success': False, 'error': str(e), 'traceback': error_trace}), 500

@app.route('/stats', methods=['GET'])
@app.route('/api/stats', methods=['GET'])  # Also accept /api prefix
def get_stats():
    """Get statistics"""
    try:
        conn = sqlite3.connect(BIDS_DB)
        c = conn.cursor()
        
        # Ensure table exists
        c.execute('''CREATE TABLE IF NOT EXISTS bids 
                     (project_id INTEGER PRIMARY KEY, title TEXT, bid_amount REAL, 
                      status TEXT DEFAULT 'applied', outsource_cost REAL, profit REAL, applied_at TEXT, bid_message TEXT, reply_count INTEGER DEFAULT 0)''')
        conn.commit()
        
        # Migrate: Add columns if they don't exist
        try:
            c.execute("ALTER TABLE bids ADD COLUMN reply_count INTEGER DEFAULT 0")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Column already exists
        try:
            c.execute("ALTER TABLE bids ADD COLUMN prompt_hash TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Column already exists
        
        c.execute("SELECT COUNT(*) FROM bids")
        total = c.fetchone()[0] or 0
        c.execute("SELECT COUNT(*) FROM bids WHERE status='applied'")
        applied = c.fetchone()[0] or 0
        c.execute("SELECT COUNT(*) FROM bids WHERE status='won'")
        won = c.fetchone()[0] or 0
        c.execute("SELECT COUNT(*) FROM bids WHERE reply_count > 0")
        replies = c.fetchone()[0] or 0
        
        # Calculate totals with currency conversion to USD
        # Check if currency_code column exists
        c.execute("PRAGMA table_info(bids)")
        columns = [col[1] for col in c.fetchall()]
        has_currency = 'currency_code' in columns
        
        if has_currency:
            c.execute("SELECT bid_amount, COALESCE(currency_code, 'USD') as currency_code FROM bids WHERE bid_amount IS NOT NULL")
        else:
            c.execute("SELECT bid_amount FROM bids WHERE bid_amount IS NOT NULL")
        bid_rows = c.fetchall()
        total_value = 0.0
        for row in bid_rows:
            bid_amount = row[0]
            currency_code = row[1] if has_currency and len(row) > 1 else 'USD'
            total_value += convert_to_usd(bid_amount, currency_code)
        
        if has_currency:
            c.execute("SELECT profit, COALESCE(currency_code, 'USD') as currency_code FROM bids WHERE profit IS NOT NULL")
        else:
            c.execute("SELECT profit FROM bids WHERE profit IS NOT NULL")
        profit_rows = c.fetchall()
        total_profit = 0.0
        for row in profit_rows:
            profit = row[0]
            currency_code = row[1] if has_currency and len(row) > 1 else 'USD'
            total_profit += convert_to_usd(profit, currency_code)
        
        conn.close()
        
        return jsonify({
            'total_bids': total,
            'applied': applied,
            'won': won,
            'replies': replies,
            'total_value': total_value,
            'total_profit': total_profit
        })
    except Exception as e:
        import traceback
        error_msg = f"Error getting stats: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

def sync_prompt_stats():
    """Sync prompt stats from bids table"""
    try:
        init_prompts_table()
        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        
        # Get all prompts
        c.execute("SELECT id FROM prompts")
        prompt_ids = [row[0] for row in c.fetchall()]
        
        for prompt_id in prompt_ids:
            # Get prompt hash
            c.execute("SELECT template FROM prompts WHERE id = ?", (prompt_id,))
            result = c.fetchone()
            if not result:
                continue
            
            import hashlib
            prompt_hash = hashlib.md5(result[0].encode('utf-8')).hexdigest()[:16]
            
            # Count bids, replies, and wins for this prompt
            c.execute("SELECT COUNT(*), SUM(CASE WHEN reply_count > 0 THEN 1 ELSE 0 END), SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) FROM bids WHERE prompt_hash = ?", (prompt_hash,))
            stats = c.fetchone()
            
            if stats:
                bids_count = stats[0] or 0
                replies_count = stats[1] or 0
                won_count = stats[2] or 0
                
                c.execute("UPDATE prompts SET stats_bids = ?, stats_replies = ?, stats_won = ? WHERE id = ?",
                         (bids_count, replies_count, won_count, prompt_id))
        
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error syncing prompt stats: {e}")

@app.route('/analytics/prompts', methods=['GET'])
def get_prompt_analytics():
    """Get prompt performance analytics - includes all prompts, even with no bids"""
    try:
        import hashlib
        conn = sqlite3.connect(BIDS_DB)
        c = conn.cursor()
        
        # Ensure tables exist
        c.execute('''CREATE TABLE IF NOT EXISTS bids 
                     (project_id INTEGER PRIMARY KEY, title TEXT, bid_amount REAL, 
                      status TEXT DEFAULT 'applied', outsource_cost REAL, profit REAL, applied_at TEXT, bid_message TEXT, reply_count INTEGER DEFAULT 0, prompt_hash TEXT)''')
        init_prompts_table()
        init_prompt_metadata_table()
        conn.commit()
        
        # Migrate: Add prompt_hash column if it doesn't exist
        try:
            c.execute("ALTER TABLE bids ADD COLUMN prompt_hash TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Column already exists
        
        # Get all prompts from prompts table and calculate their hashes
        c.execute("SELECT id, name, template, created_at FROM prompts")
        all_prompts = c.fetchall()
        
        # Create a map of prompt_hash -> prompt info
        prompt_hash_map = {}
        for prompt_id, prompt_name, template, created_at in all_prompts:
            prompt_hash = hashlib.md5(template.encode('utf-8')).hexdigest()[:16]
            prompt_hash_map[prompt_hash] = {
                'name': prompt_name,
                'created_at': created_at,
                'id': prompt_id
            }
        
        # Get analytics from bids grouped by prompt_hash
        c.execute("""
            SELECT 
                COALESCE(b.prompt_hash, 'unknown') as prompt_hash,
                COUNT(*) as total_bids,
                SUM(CASE WHEN b.reply_count > 0 THEN 1 ELSE 0 END) as total_replies,
                SUM(CASE WHEN b.status = 'won' THEN 1 ELSE 0 END) as total_won,
                ROUND(AVG(CASE WHEN b.reply_count > 0 THEN 1.0 ELSE 0.0 END) * 100, 2) as reply_rate,
                MIN(b.applied_at) as first_used,
                MAX(b.applied_at) as last_used,
                pm.name as prompt_name
            FROM bids b
            LEFT JOIN prompt_metadata pm ON b.prompt_hash = pm.prompt_hash
            WHERE b.prompt_hash IS NOT NULL
            GROUP BY b.prompt_hash
        """)
        
        bid_results = c.fetchall()
        
        # Create analytics dict from bids data
        analytics_dict = {}
        for row in bid_results:
            prompt_hash, total_bids, total_replies, total_won, reply_rate, first_used, last_used, prompt_name = row
            analytics_dict[prompt_hash] = {
                'prompt_hash': prompt_hash,
                'prompt_name': prompt_name or prompt_hash_map.get(prompt_hash, {}).get('name'),
                'total_bids': total_bids or 0,
                'total_replies': total_replies or 0,
                'total_won': total_won or 0,
                'reply_rate': reply_rate or 0.0,
                'first_used': first_used,
                'last_used': last_used
            }
        
        # Add all prompts from prompts table, even if they have no bids
        for prompt_hash, prompt_info in prompt_hash_map.items():
            if prompt_hash not in analytics_dict:
                analytics_dict[prompt_hash] = {
                    'prompt_hash': prompt_hash,
                    'prompt_name': prompt_info['name'],
                    'total_bids': 0,
                    'total_replies': 0,
                    'total_won': 0,
                    'reply_rate': 0.0,
                    'first_used': prompt_info['created_at'],
                    'last_used': None
                }
        
        # Convert to list and sort by total_bids DESC, then by name
        analytics = list(analytics_dict.values())
        analytics.sort(key=lambda x: (x['total_bids'], x['prompt_name'] or ''), reverse=True)
        
        conn.close()
        return jsonify(analytics)
    except Exception as e:
        import traceback
        error_msg = f"Error getting prompt analytics: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

def check_autobidder_running():
    """Check if autobidder is running (either via API or externally)"""
    global autobidder_process, autobidder_running
    
    # First check if we started it via API
    try:
        if autobidder_running and autobidder_process:
            if autobidder_process.poll() is None:
                return True
    except (AttributeError, ValueError, OSError):
        # Process object is invalid or already dead
        pass
    
    # Also check if there's an autobidder.py process running (started externally)
    try:
        import psutil
        for proc in psutil.process_iter():
            try:
                proc_pid = proc.pid
                if proc_pid == os.getpid():
                    continue
                try:
                    cmdline = proc.cmdline()
                    if cmdline:
                        cmdline_str = ' '.join(str(c) for c in cmdline).lower()
                        # Check if it's a python process running autobidder.py
                        if ('python' in cmdline_str or 'pythonw' in cmdline_str) and 'autobidder.py' in cmdline_str:
                            return True
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess, AttributeError):
                continue
    except ImportError:
        # psutil not available, fallback to checking log file activity
        pass
    
    # Fallback: Check if log file has recent activity (within last 60 seconds)
    try:
        if os.path.exists(LOG_FILE):
            import time
            mod_time = os.path.getmtime(LOG_FILE)
            # If log was modified in last 60 seconds, likely running
            if time.time() - mod_time < 60:
                # Check if log file has activity indicators
                with open(LOG_FILE, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    if lines:
                        last_line = lines[-1].strip()
                        # Look for indicators that autobidder is active
                        active_indicators = [
                            'AUTOBIDDER STARTED',
                            'Scanning for new projects',
                            'MATCHING PROJECT',
                            'BID SUCCESS',
                            'Attempting to bid',
                            'Sleeping for'
                        ]
                        if any(indicator in last_line for indicator in active_indicators):
                            return True
                        # If log was modified very recently (last 10 seconds), assume running
                        if time.time() - mod_time < 10:
                            return True
    except Exception as e:
        print(f"Error checking log file: {e}")
    
    return False

@app.route('/autobidder/status', methods=['GET'])
@app.route('/api/autobidder/status', methods=['GET'])  # Also accept /api prefix
def autobidder_status():
    """Get autobidder status"""
    global autobidder_process, autobidder_running
    
    is_running = check_autobidder_running()
    
    # Update global state if we detect it's running externally
    if is_running and not autobidder_running:
        autobidder_running = True
    
    return jsonify({
        'running': is_running,
        'message': 'Running' if is_running else 'Stopped'
    })

def read_logs_tail(n=100):
    """Read last n lines from log file"""
    try:
        with open(LOG_FILE, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            return lines[-n:] if len(lines) > n else lines
    except FileNotFoundError:
        return []
    except Exception as e:
        print(f"Error reading logs: {e}")
        return []

@app.route('/autobidder/logs', methods=['GET'])
@app.route('/api/autobidder/logs', methods=['GET'])  # Also accept /api prefix
def get_logs():
    """Get autobidder logs"""
    try:
        lines = request.args.get('lines', 200, type=int)
        log_lines = read_logs_tail(lines)
        return jsonify({
            'logs': [line.strip() for line in log_lines],
            'total': len(log_lines)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/autobidder/start', methods=['POST'])
@app.route('/api/autobidder/start', methods=['POST'])  # Also accept /api prefix
def start_autobidder():
    """Start autobidder"""
    global autobidder_process, autobidder_running
    
    if autobidder_running and autobidder_process and autobidder_process.poll() is None:
        return jsonify({'success': False, 'error': 'Autobidder already running'})
    
    try:
        # Clear old log file
        with open(LOG_FILE, 'w', encoding='utf-8') as f:
            f.write('')
        
        autobidder_process = subprocess.Popen(
            ['python', 'autobidder.py'],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )
        autobidder_running = True
        return jsonify({'success': True, 'message': 'Autobidder started'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/autobidder/stop', methods=['POST'])
@app.route('/api/autobidder/stop', methods=['POST'])  # Also accept /api prefix
def stop_autobidder():
    """Stop autobidder (works for both API-started and externally-started processes)"""
    global autobidder_process, autobidder_running
    
    stopped = False
    error_details = []
    
    try:
        # First, try to stop if we started it via API
        # Check autobidder_process directly, not autobidder_running (which we'll set to False later)
        if autobidder_process:
            try:
                # Check if process is still running
                is_running = False
                try:
                    if autobidder_process.poll() is None:  # Process is still running
                        is_running = True
                except (AttributeError, ValueError, OSError) as poll_error:
                    # Process object is invalid or already dead
                    error_details.append(f"Poll check error: {str(poll_error)}")
                    is_running = False
                
                if is_running:
    try:
        autobidder_process.terminate()
                        try:
        autobidder_process.wait(timeout=5)
                            stopped = True
                        except subprocess.TimeoutExpired:
                            try:
                                autobidder_process.kill()
                                autobidder_process.wait()
                                stopped = True
    except Exception as e:
                                error_details.append(f"Kill failed: {str(e)}")
                        except Exception as e:
                            error_details.append(f"Wait failed: {str(e)}")
                    except Exception as e:
                        error_details.append(f"Terminate failed: {str(e)}")
                        # Try kill as fallback
                        try:
                            if autobidder_process:
            autobidder_process.kill()
                                try:
                                    autobidder_process.wait(timeout=2)
                                    stopped = True
        except:
                                    stopped = True
                        except Exception as e2:
                            error_details.append(f"Kill fallback failed: {str(e2)}")
                else:
                    # Process already dead
                    stopped = True
            except Exception as e:
                error_details.append(f"Process stop error: {str(e)}")
            finally:
                # Always clear the process reference
                autobidder_process = None
        
        # Also check for externally started processes and stop them
        try:
            import psutil
        except ImportError:
            # psutil not available, skip external process detection
            pass
        else:
            processes_to_stop = []
            # First, collect all matching processes - use simple iteration
            try:
                for proc in psutil.process_iter():
                    try:
                        # Get PID first
                        proc_pid = proc.pid
                        if proc_pid == os.getpid():
                            continue
                        
                        # Get cmdline
                        try:
                            cmdline = proc.cmdline()
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            continue
                        
                        if not cmdline:
                            continue
                            
                        cmdline_str = ' '.join(str(c) for c in cmdline).lower()
                        # Check if it's a python process running autobidder.py
                        if ('python' in cmdline_str or 'pythonw' in cmdline_str) and 'autobidder.py' in cmdline_str:
                            processes_to_stop.append(proc)
                    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess, AttributeError):
                        continue
                    except Exception as e:
                        error_details.append(f"Process iteration error: {str(e)}")
                        continue
            except Exception as e:
                error_details.append(f"process_iter error: {str(e)}")
            
            # Now stop all collected processes
            for proc in processes_to_stop:
                try:
                    proc.terminate()
                    # Simple wait loop
                    for _ in range(50):  # 5 seconds max (50 * 0.1)
                        try:
                            if hasattr(proc, 'is_running'):
                                if not proc.is_running():
                                    break
                            else:
                                # Check status
                                try:
                                    status = proc.status()
                                    if hasattr(psutil, 'STATUS_ZOMBIE') and status == psutil.STATUS_ZOMBIE:
                                        break
                                    if hasattr(psutil, 'STATUS_DEAD') and status == psutil.STATUS_DEAD:
                                        break
                                except (psutil.NoSuchProcess, psutil.AccessDenied):
                                    break
                                except:
                                    break
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            break
                        except:
                            break
                        time.sleep(0.1)
                    
                    # Force kill if still running
                    try:
                        if hasattr(proc, 'is_running'):
                            if proc.is_running():
                                proc.kill()
                        else:
                            try:
                                proc.status()  # Check if exists
                                proc.kill()
                            except psutil.NoSuchProcess:
                                pass
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
                    except Exception as e:
                        error_details.append(f"Kill error: {str(e)}")
                    
                    stopped = True
                except Exception as e:
                    error_details.append(f"Stop process error: {str(e)}")
        
        # Always mark as stopped in global state after attempting to stop all processes
        autobidder_running = False
        if autobidder_process:
            autobidder_process = None
        
        # Give processes a moment to fully terminate
        import time
        time.sleep(0.5)
        
        # Check final status
        if stopped:
            # Log stop message
            try:
                with open(LOG_FILE, 'a', encoding='utf-8') as f:
                    from datetime import datetime
                    f.write(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | AUTOBIDDER STOPPED via API\n")
            except:
                pass
            return jsonify({
                'success': True, 
                'message': 'Autobidder stopped',
                'details': error_details if error_details else None
            })
        else:
            # No process was stopped, check if it's actually running
            try:
                is_running = False
                try:
                    is_running = check_autobidder_running()
                except Exception as check_error:
                    error_details.append(f"Status check error: {str(check_error)}")
                    # Assume not running if check fails
                    is_running = False
                
                # Always return success - if it's not running, that's what we want
                # If it is running but we couldn't stop it, still return success
                # to prevent UI from getting stuck. The status endpoint will show
                # the actual running state.
                # Note: autobidder_running is already set to False above
                if is_running:
                    return jsonify({
                        'success': True, 
                        'message': 'Autobidder stop command sent (may still be running - check status)',
                        'details': error_details if error_details else None,
                        'warning': 'Process may still be running. Check status or manually terminate if needed.'
                    })
                else:
                    return jsonify({
                        'success': True, 
                        'message': 'Autobidder was not running (already stopped)',
                        'details': error_details if error_details else None
                    })
            except Exception as e:
                import traceback
                error_details.append(f"Final check error: {str(e)}")
                # Always return success - we've marked it as stopped
                autobidder_running = False
                return jsonify({
                    'success': True, 
                    'message': 'Autobidder marked as stopped',
                    'error': f'Error checking status: {str(e)}' if app.debug else None,
                    'details': error_details
                })
                
    except Exception as e:
        import traceback
        import sys
        error_msg = f"Error in stop_autobidder: {str(e)}"
        traceback_str = traceback.format_exc()
        # Use sys.stderr for immediate output in Windows
        try:
            sys.stderr.write(f"{error_msg}\n{traceback_str}\n")
            sys.stderr.flush()
        except:
            pass
        
        # Always mark as not running on error
        try:
            autobidder_running = False
            autobidder_process = None
        except:
            pass
        
        # Always return success - we've marked it as stopped
        # This prevents UI from getting stuck even if process termination fails
        try:
            return jsonify({
                'success': True, 
                'message': 'Autobidder marked as stopped',
                'error': error_msg if app.debug else None,
                'details': error_details
            })
        except Exception as json_error:
            # Last resort - return plain text if JSON fails
            from flask import Response
            return Response(
                '{"success": true, "message": "Autobidder marked as stopped"}',
                status=200,
                mimetype='application/json'
            )

@app.route('/', methods=['GET'])
def root():
    """Root endpoint - API information"""
    return jsonify({
        'status': 'ok',
        'message': 'Autobidder API Server',
        'version': '1.0',
        'endpoints': {
            'health': '/health',
            'stats': '/api/stats',
            'bids': '/api/bids',
            'config': '/api/config',
            'prompts': '/api/prompts',
            'autobidder_status': '/api/autobidder/status',
            'autobidder_logs': '/api/autobidder/logs',
        },
        'docs': 'This is the API server. Use the endpoints above to interact with the autobidder.'
    })

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'API server is running'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    print(f"Starting Autobidder API Server on http://0.0.0.0:{port}")
    print("Make sure to update API_BASE_URL in mobile/services/api.js if needed")
    app.run(host='0.0.0.0', port=port, debug=False)  # debug=False for production

