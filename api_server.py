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
                        for j, char in enumerate(value):
                            if char == "'" and (j == 0 or value[j-1] != '\\'):
                                in_single_quote = not in_single_quote
                            elif char == '"' and (j == 0 or value[j-1] != '\\'):
                                in_double_quote = not in_double_quote
                            elif char == '#' and not in_single_quote and not in_double_quote:
                                comment_pos = j
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
        
        # Ensure table exists with all columns (keep in sync with autobidder.py)
        c.execute('''CREATE TABLE IF NOT EXISTS bids 
                     (project_id INTEGER PRIMARY KEY, title TEXT, bid_amount REAL, 
                      status TEXT DEFAULT 'applied', outsource_cost REAL, profit REAL, applied_at TEXT, 
                      bid_message TEXT, reply_count INTEGER DEFAULT 0, prompt_hash TEXT, currency_code TEXT,
                      prompt_id INTEGER, pipeline_stage TEXT, dev_billing_model TEXT, dev_hours REAL,
                      dev_rate REAL, assigned_freelancer TEXT, client_billing_model TEXT, client_hours REAL,
                      client_rate REAL, client_total REAL, dev_total_usd REAL, excluded_from_stats INTEGER DEFAULT 0)''')
        
        # Migrate: Add columns if they don't exist (older DBs)
        for alter in [
            "ALTER TABLE bids ADD COLUMN bid_message TEXT",
            "ALTER TABLE bids ADD COLUMN reply_count INTEGER DEFAULT 0",
            "ALTER TABLE bids ADD COLUMN prompt_hash TEXT",
            "ALTER TABLE bids ADD COLUMN currency_code TEXT",
            "ALTER TABLE bids ADD COLUMN prompt_id INTEGER",
            "ALTER TABLE bids ADD COLUMN fallback_reason TEXT",
        ]:
            try:
                c.execute(alter)
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
        # Try to get the currently active prompt so we can tag bids with it
        active_prompt_id = None
        try:
            init_prompts_table()
            pc = conn.cursor()
            pc.execute("SELECT id FROM prompts WHERE is_active = 1 LIMIT 1")
            row = pc.fetchone()
            if row:
                active_prompt_id = row[0]
        except Exception:
            active_prompt_id = None
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
                
                # Determine billing model and always try to fetch project details
                # to get accurate currency and payment type (hourly vs fixed).
                client_billing_model = None

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

                                # Try to infer payment type (hourly vs fixed) from project data
                                payment_type = (
                                    str(project_data.get('type', ''))
                                    or str(project_data.get('project_type', ''))
                                    or str(budget_data.get('type', ''))
                                ).lower()
                                if 'hour' in payment_type:
                                    client_billing_model = 'hourly'
                                elif payment_type:
                                    client_billing_model = 'fixed'
                    except Exception as e:
                        print(f"Error fetching project {project_id} for currency: {e}")
                        if not title:
                            title = f'Project {project_id}'
                
                if not title:
                    title = f'Project {project_id}'
                
                # Check for reply count in bid data
                reply_count = bid.get('reply_count') or bid.get('message_count') or bid.get('replies') or 0
                
                # Insert or update bid (preserve existing status if it's 'won', preserve reply_count if higher)
                c.execute("SELECT status, reply_count, currency_code, client_billing_model FROM bids WHERE project_id=?", (project_id,))
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

                # If we didn't infer billing model from project, keep existing one if present
                if existing_data and len(existing_data) > 3 and existing_data[3]:
                    if not client_billing_model:
                        client_billing_model = existing_data[3]
                
                # Prefer to store prompt_id when available; fall back gracefully on older schemas
                try:
                    c.execute(
                        """INSERT OR REPLACE INTO bids 
                            (project_id, title, bid_amount, status, applied_at, bid_message, reply_count, currency_code, client_billing_model, prompt_id) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            project_id,
                            title,
                            bid_amount,
                            status,
                            submitted_time,
                            bid_message,
                            reply_count,
                            currency_code,
                            client_billing_model,
                            active_prompt_id,
                        ),
                    )
                except sqlite3.OperationalError:
                    # Older DB without prompt_id column
                    c.execute(
                        """INSERT OR REPLACE INTO bids 
                            (project_id, title, bid_amount, status, applied_at, bid_message, reply_count, currency_code, client_billing_model) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            project_id,
                            title,
                            bid_amount,
                            status,
                            submitted_time,
                            bid_message,
                            reply_count,
                            currency_code,
                            client_billing_model,
                        ),
                    )
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


# === DEAL MILESTONES ===
def init_milestones_table():
    """Ensure milestones table exists."""
    conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
    c = conn.cursor()
    c.execute(
        '''CREATE TABLE IF NOT EXISTS milestones (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               project_id INTEGER NOT NULL,
               title TEXT NOT NULL,
               amount REAL DEFAULT 0,
               due_date TEXT,
               status TEXT DEFAULT 'pending',
               created_at TEXT DEFAULT CURRENT_TIMESTAMP,
               updated_at TEXT DEFAULT CURRENT_TIMESTAMP
           )'''
    )
    conn.commit()
    conn.close()


@app.route('/bids/<int:project_id>/milestones', methods=['GET'])
@app.route('/api/bids/<int:project_id>/milestones', methods=['GET'])
def get_milestones(project_id):
    """Get milestones for a specific project/deal."""
    try:
        init_milestones_table()
        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        c.execute(
            "SELECT id, project_id, title, amount, due_date, status, created_at, updated_at "
            "FROM milestones WHERE project_id = ? ORDER BY created_at ASC",
            (project_id,),
        )
        rows = c.fetchall()
        conn.close()
        milestones = []
        for row in rows:
            milestones.append(
                {
                    "id": row[0],
                    "project_id": row[1],
                    "title": row[2],
                    "amount": row[3],
                    "due_date": row[4],
                    "status": row[5],
                    "created_at": row[6],
                    "updated_at": row[7],
                }
            )
        return jsonify(milestones)
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


@app.route('/bids/<int:project_id>/milestones', methods=['POST'])
@app.route('/api/bids/<int:project_id>/milestones', methods=['POST'])
def create_milestone(project_id):
    """Create a milestone for a project/deal."""
    try:
        data = request.json or {}
        title = (data.get("title") or "").strip()
        amount = float(data.get("amount", 0) or 0)
        due_date = data.get("due_date")
        if not title:
            return jsonify({"success": False, "error": "Title is required"}), 400
        init_milestones_table()
        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        c.execute(
            "INSERT INTO milestones (project_id, title, amount, due_date) "
            "VALUES (?, ?, ?, ?)",
            (project_id, title, amount, due_date),
        )
        milestone_id = c.lastrowid
        conn.commit()
        conn.close()
        return jsonify({"success": True, "id": milestone_id})
    except Exception as e:
        import traceback
        return jsonify({"success": False, "error": str(e), "traceback": traceback.format_exc()}), 500


@app.route('/bids/milestones/<int:milestone_id>/status', methods=['POST'])
@app.route('/api/bids/milestones/<int:milestone_id>/status', methods=['POST'])
def update_milestone_status(milestone_id):
    """Update milestone status. If all milestones for project are complete, update deal stage."""
    try:
        data = request.json or {}
        status = data.get("status", "pending")
        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        # Get project id for this milestone
        c.execute("SELECT project_id FROM milestones WHERE id = ?", (milestone_id,))
        row = c.fetchone()
        if not row:
            conn.close()
            return jsonify({"success": False, "error": "Milestone not found"}), 404
        project_id = row[0]
        # Update milestone
        c.execute(
            "UPDATE milestones SET status = ?, updated_at = datetime('now') WHERE id = ?",
            (status, milestone_id),
        )
        # If marking complete, check if all milestones are complete
        if status == "completed":
            c.execute(
                "SELECT COUNT(*) FROM milestones WHERE project_id = ? AND status != 'completed'",
                (project_id,),
            )
            remaining = c.fetchone()[0] or 0
            if remaining == 0:
                # All milestones complete → move deal to Delivered
                c.execute(
                    "UPDATE bids SET pipeline_stage = 'Delivered' WHERE project_id = ?",
                    (project_id,),
                )
        conn.commit()
        conn.close()
        return jsonify({"success": True, "project_id": project_id, "status": status})
    except Exception as e:
        import traceback
        return jsonify({"success": False, "error": str(e), "traceback": traceback.format_exc()}), 500

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
        # Migrations: ensure columns exist
        for alter in [
            "ALTER TABLE bids ADD COLUMN bid_message TEXT",
            "ALTER TABLE bids ADD COLUMN currency_code TEXT",
            "ALTER TABLE bids ADD COLUMN prompt_id INTEGER",
            "ALTER TABLE bids ADD COLUMN reply_count INTEGER DEFAULT 0",
            "ALTER TABLE bids ADD COLUMN pipeline_stage TEXT",
            "ALTER TABLE bids ADD COLUMN client_billing_model TEXT",
            "ALTER TABLE bids ADD COLUMN client_hours REAL",
            "ALTER TABLE bids ADD COLUMN client_rate REAL",
            "ALTER TABLE bids ADD COLUMN client_total REAL",
            "ALTER TABLE bids ADD COLUMN dev_billing_model TEXT",
            "ALTER TABLE bids ADD COLUMN dev_hours REAL",
            "ALTER TABLE bids ADD COLUMN dev_rate REAL",
            "ALTER TABLE bids ADD COLUMN dev_total_usd REAL",
            "ALTER TABLE bids ADD COLUMN assigned_freelancer TEXT",
            "ALTER TABLE bids ADD COLUMN fallback_reason TEXT",
        ]:
            try:
                c.execute(alter)
                conn.commit()
            except sqlite3.OperationalError:
                pass  # Column already exists
        
        # Check which columns exist
        c.execute("PRAGMA table_info(bids)")
        columns = [col[1] for col in c.fetchall()]
        has_currency = 'currency_code' in columns
        has_reply_count = 'reply_count' in columns
        has_prompt_id = 'prompt_id' in columns
        has_pipeline = 'pipeline_stage' in columns
        has_assigned = 'assigned_freelancer' in columns
        has_fallback_reason = 'fallback_reason' in columns
        # These extra columns are mostly for analytics / kanban
        has_dev_meta = 'dev_billing_model' in columns or 'dev_hours' in columns or 'dev_rate' in columns
        
        # Force a fresh read by using a transaction
        c.execute("BEGIN IMMEDIATE")
        if has_prompt_id:
            # Join prompts to return prompt name when available
            select_sql = """SELECT b.project_id, b.title, b.bid_amount, b.status, b.outsource_cost, b.profit,
                         b.applied_at, b.bid_message,
                         {reply_col}{comma1}{currency_col}{comma2}b.prompt_id, p.name as prompt_name{fallback_col}""".format(
                reply_col="b.reply_count" if has_reply_count else "NULL as reply_count",
                currency_col="b.currency_code" if has_currency else "NULL as currency_code",
                comma1=", " if has_reply_count else "",
                comma2=", " if has_currency else "",
                fallback_col=", b.fallback_reason" if has_fallback_reason else ""
            )
            if has_pipeline:
                select_sql += ", b.pipeline_stage"
            if has_assigned:
                select_sql += ", b.assigned_freelancer"
            select_sql += " FROM bids b LEFT JOIN prompts p ON b.prompt_id = p.id ORDER BY b.applied_at DESC"
            c.execute(select_sql)
        elif has_currency and has_reply_count:
            select_sql = """SELECT project_id, title, bid_amount, status, outsource_cost, profit, 
                         applied_at, bid_message, reply_count, currency_code"""
            if has_fallback_reason:
                select_sql += ", fallback_reason"
            if has_pipeline:
                select_sql += ", pipeline_stage"
            if has_assigned:
                select_sql += ", assigned_freelancer"
            select_sql += " FROM bids ORDER BY applied_at DESC"
            c.execute(select_sql)
        elif has_currency:
            select_sql = """SELECT project_id, title, bid_amount, status, outsource_cost, profit, 
                         applied_at, bid_message, currency_code"""
            if has_fallback_reason:
                select_sql += ", fallback_reason"
            if has_pipeline:
                select_sql += ", pipeline_stage"
            if has_assigned:
                select_sql += ", assigned_freelancer"
            select_sql += " FROM bids ORDER BY applied_at DESC"
            c.execute(select_sql)
        elif has_reply_count:
            select_sql = """SELECT project_id, title, bid_amount, status, outsource_cost, profit, 
                         applied_at, bid_message, reply_count"""
            if has_fallback_reason:
                select_sql += ", fallback_reason"
            if has_pipeline:
                select_sql += ", pipeline_stage"
            if has_assigned:
                select_sql += ", assigned_freelancer"
            select_sql += " FROM bids ORDER BY applied_at DESC"
            c.execute(select_sql)
        else:
            select_sql = """SELECT project_id, title, bid_amount, status, outsource_cost, profit, 
                         applied_at, bid_message"""
            if has_fallback_reason:
                select_sql += ", fallback_reason"
            if has_pipeline:
                select_sql += ", pipeline_stage"
            if has_assigned:
                select_sql += ", assigned_freelancer"
            select_sql += " FROM bids ORDER BY applied_at DESC"
            c.execute(select_sql)
        rows = c.fetchall()
        c.execute("COMMIT")
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
            # Add reply_count and currency/prompt columns based on selection order above
            if has_prompt_id:
                idx = 8
                bid_data['reply_count'] = row[idx] if has_reply_count and len(row) > idx and row[idx] is not None else 0
                if has_reply_count:
                    idx += 1
                bid_data['currency_code'] = row[idx] if has_currency and len(row) > idx and row[idx] else None
                if has_currency:
                    idx += 1
                bid_data['prompt_id'] = row[idx] if len(row) > idx else None
                bid_data['prompt_name'] = row[idx + 1] if len(row) > idx + 1 else None
                # fallback_reason comes after prompt_name
                if has_fallback_reason:
                    bid_data['fallback_reason'] = row[idx + 2] if len(row) > idx + 2 and row[idx + 2] else None
            elif has_reply_count and has_currency:
                bid_data['reply_count'] = row[8] if len(row) > 8 and row[8] is not None else 0
                bid_data['currency_code'] = row[9] if len(row) > 9 and row[9] else None
                if has_fallback_reason:
                    bid_data['fallback_reason'] = row[10] if len(row) > 10 and row[10] else None
            elif has_reply_count:
                bid_data['reply_count'] = row[8] if len(row) > 8 and row[8] is not None else 0
                bid_data['currency_code'] = None
                if has_fallback_reason:
                    bid_data['fallback_reason'] = row[9] if len(row) > 9 and row[9] else None
            elif has_currency:
                bid_data['reply_count'] = 0
                bid_data['currency_code'] = row[8] if len(row) > 8 and row[8] else None
                if has_fallback_reason:
                    bid_data['fallback_reason'] = row[9] if len(row) > 9 and row[9] else None
            else:
                bid_data['reply_count'] = 0
                bid_data['currency_code'] = None
                if has_fallback_reason:
                    bid_data['fallback_reason'] = row[8] if len(row) > 8 and row[8] else None
            
            # Ensure fallback_reason is set (default to None if column doesn't exist)
            if 'fallback_reason' not in bid_data:
                bid_data['fallback_reason'] = None

            # Pipeline stage and assigned_freelancer (if columns exist)
            if has_pipeline:
                # Find pipeline_stage - it's after prompt_name (if prompt_id exists) or after currency_code
                if has_prompt_id:
                    # After prompt_name (which is idx + 1)
                    pipeline_idx = (idx + 1) + 1
                elif has_currency:
                    # After currency_code
                    pipeline_idx = 10 if has_reply_count else 9
                elif has_reply_count:
                    pipeline_idx = 9
                else:
                    pipeline_idx = 8
                bid_data['pipeline_stage'] = row[pipeline_idx] if len(row) > pipeline_idx else None
                if has_assigned:
                    bid_data['assigned_freelancer'] = row[pipeline_idx + 1] if len(row) > pipeline_idx + 1 else None
                else:
                    bid_data['assigned_freelancer'] = None
            else:
                bid_data['pipeline_stage'] = None
                bid_data['assigned_freelancer'] = None

            # Load client/dev billing metadata if columns exist
            try:
                if 'client_billing_model' in columns:
                    detail_conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
                    dc = detail_conn.cursor()
                    dc.execute(
                        "SELECT client_billing_model, client_hours, client_rate, client_total, "
                        "dev_billing_model, dev_hours, dev_rate "
                        "FROM bids WHERE project_id = ?",
                        (bid_data['project_id'],),
                    )
                    drow = dc.fetchone()
                    detail_conn.close()
                    if drow:
                        bid_data['client_billing_model'] = drow[0]
                        bid_data['client_hours'] = drow[1]
                        bid_data['client_rate'] = drow[2]
                        bid_data['client_total'] = drow[3]
                        bid_data['dev_billing_model'] = drow[4]
                        bid_data['dev_hours'] = drow[5]
                        bid_data['dev_rate'] = drow[6]
            except Exception:
                # Don't break get_bids if billing metadata can't be loaded
                pass

            # Add USD-equivalent value for consistent insights with dashboard totals
            try:
                amount = bid_data['bid_amount'] or 0
                code = bid_data['currency_code'] or 'USD'
                bid_data['bid_amount_usd'] = convert_to_usd(amount, code)
            except Exception:
                bid_data['bid_amount_usd'] = bid_data['bid_amount']

            bids.append(bid_data)
        conn.close()
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


@app.route('/bids/<int:project_id>/cost', methods=['POST'])
@app.route('/api/bids/<int:project_id>/cost', methods=['POST'])
def set_bid_cost(project_id):
    """Set client final amount, outsourcing cost and profit for a bid, and mark it as won.
    
    Expects JSON:
      {
        "client_billing_model": "hourly"|"fixed",
        "client_hours": number (optional, for hourly),
        "client_rate": number (optional, for hourly),
        "client_total": number (optional, overrides calc),
        "dev_billing_model": "hourly"|"fixed",
        "dev_hours": number (optional, for hourly),
        "dev_rate": number (optional, for hourly),
        "dev_total": number (optional, overrides calc)
      }
    """
    try:
        data = request.json or {}
        client_billing_model = data.get('client_billing_model')
        client_hours = data.get('client_hours')
        client_rate = data.get('client_rate')
        dev_billing_model = data.get('dev_billing_model')
        dev_hours = data.get('dev_hours')
        dev_rate = data.get('dev_rate')

        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        c.execute("SELECT bid_amount, COALESCE(currency_code, 'USD') FROM bids WHERE project_id = ?", (project_id,))
        row = c.fetchone()
        if not row:
            conn.close()
            return jsonify({'success': False, 'error': 'Bid not found'}), 404

        original_bid_amount = row[0] or 0.0
        currency_code = row[1] or 'USD'

        # Compute client_total if not provided explicitly
        client_total = data.get('client_total')
        if client_total is None:
            if client_billing_model == 'hourly' and client_hours is not None and client_rate is not None:
                client_total = float(client_hours) * float(client_rate)
            else:
                # Fallback: use original bid amount
                client_total = original_bid_amount
        client_total = float(client_total)

        # Compute dev_total_usd (what you pay dev, in USD)
        dev_total_usd = data.get('dev_total')
        if dev_total_usd is None:
            if dev_billing_model == 'hourly' and dev_hours is not None and dev_rate is not None:
                dev_total_usd = float(dev_hours) * float(dev_rate)
            else:
                # If nothing provided, assume zero cost
                dev_total_usd = 0.0
        dev_total_usd = float(dev_total_usd)

        # Convert dev USD cost into project currency for consistent storage
        # convert_to_usd(amount_local, code) = amount_local * rate
        # => amount_local = usd / rate
        try:
            from_currency = currency_code.upper() if isinstance(currency_code, str) else 'USD'
            if from_currency == 'USD':
                dev_total_local = dev_total_usd
            else:
                rate = {
                    'INR': 0.012,
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
                }.get(from_currency, 1.0)
                if rate <= 0:
                    dev_total_local = dev_total_usd
                else:
                    dev_total_local = dev_total_usd / rate
        except Exception:
            dev_total_local = dev_total_usd

        # Profit is calculated in project currency for consistency with existing stats
        profit = client_total - dev_total_local

        c.execute(
            "UPDATE bids SET status = 'won', "
            "client_billing_model = COALESCE(?, client_billing_model), "
            "client_hours = COALESCE(?, client_hours), "
            "client_rate = COALESCE(?, client_rate), "
            "client_total = ?, "
            "outsource_cost = ?, "
            "profit = ?, "
            "dev_total_usd = COALESCE(?, dev_total_usd), "
            "dev_billing_model = COALESCE(?, dev_billing_model), "
            "dev_hours = COALESCE(?, dev_hours), "
            "dev_rate = COALESCE(?, dev_rate), "
            "pipeline_stage = COALESCE(pipeline_stage, 'Won') "
            "WHERE project_id = ?",
            (
                client_billing_model,
                client_hours,
                client_rate,
                client_total,
                dev_total_local,
                profit,
                dev_total_usd,
                dev_billing_model,
                dev_hours,
                dev_rate,
                project_id,
            ),
        )
        conn.commit()
        conn.close()
        return jsonify({
            'success': True,
            'project_id': project_id,
            'original_bid_amount': original_bid_amount,
            'client_total': client_total,
            # Dev total stored/used in two forms:
            # - dev_total_local: in project currency (matches outsource_cost / profit math)
            # - dev_total_usd: in USD (what you actually pay the dev)
            'dev_total': dev_total_local,
            'dev_total_local': dev_total_local,
            'dev_total_usd': dev_total_usd,
            'profit': profit,
            'currency_code': currency_code,
        })
    except Exception as e:
        import traceback
        return jsonify({'success': False, 'error': str(e), 'traceback': traceback.format_exc()}), 500


@app.route('/bids/<int:project_id>/deal', methods=['POST'])
@app.route('/api/bids/<int:project_id>/deal', methods=['POST'])
def create_deal(project_id):
    """Mark a bid as an active deal (project won) and put it into the pipeline.
    
    Expects JSON:
      {
        "stage": "Won" | "In Progress" | ...,
        "assigned_freelancer": "name or handle" (optional)
      }
    """
    try:
        data = request.json or {}
        stage = data.get('stage', 'Won')
        assigned = data.get('assigned_freelancer')
        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        c.execute("SELECT project_id FROM bids WHERE project_id = ?", (project_id,))
        row = c.fetchone()
        if not row:
            conn.close()
            return jsonify({'success': False, 'error': 'Bid not found'}), 404
        c.execute(
            "UPDATE bids SET status = 'won', pipeline_stage = ?, assigned_freelancer = COALESCE(?, assigned_freelancer) "
            "WHERE project_id = ?",
            (stage, assigned, project_id),
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'project_id': project_id, 'stage': stage})
    except Exception as e:
        import traceback
        return jsonify({'success': False, 'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/bids/<int:project_id>/deal', methods=['DELETE'])
@app.route('/api/bids/<int:project_id>/deal', methods=['DELETE'])
def delete_deal(project_id):
    """Remove a deal from the Kanban board.
    
    Expects JSON query parameter or body:
      {
        "exclude_from_stats": true/false (optional, default false)
      }
    
    If exclude_from_stats is true, the deal is kept but marked as excluded from stats calculations.
    If false, the deal is removed entirely (pipeline_stage set to NULL).
    """
    try:
        data = request.json or {}
        exclude_from_stats = data.get('exclude_from_stats', False)
        
        conn = sqlite3.connect(BIDS_DB, check_same_thread=False)
        c = conn.cursor()
        
        # Check if bid exists
        c.execute("SELECT project_id FROM bids WHERE project_id = ?", (project_id,))
        if not c.fetchone():
            conn.close()
            return jsonify({'success': False, 'error': 'Deal not found'}), 404
        
        # Migrate: Add excluded_from_stats column if it doesn't exist
        try:
            c.execute("ALTER TABLE bids ADD COLUMN excluded_from_stats INTEGER DEFAULT 0")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Column already exists
        
        if exclude_from_stats:
            # Remove from deals but mark as excluded from stats
            c.execute(
                "UPDATE bids SET pipeline_stage = NULL, excluded_from_stats = 1 WHERE project_id = ?",
                (project_id,)
            )
            action = 'removed from deals and excluded from stats'
        else:
            # Remove from deals (clear pipeline_stage) and reset excluded flag
            c.execute(
                "UPDATE bids SET pipeline_stage = NULL, excluded_from_stats = 0 WHERE project_id = ?",
                (project_id,)
            )
            action = 'removed from deals'
        
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'project_id': project_id, 'action': action})
    except Exception as e:
        import traceback
        return jsonify({'success': False, 'error': str(e), 'traceback': traceback.format_exc()}), 500

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
        
        # Check if excluded_from_stats column exists
        c.execute("PRAGMA table_info(bids)")
        columns = [col[1] for col in c.fetchall()]
        has_excluded = 'excluded_from_stats' in columns
        
        # Build WHERE clause to exclude stats-excluded bids
        exclude_clause = "WHERE excluded_from_stats = 0" if has_excluded else ""
        
        c.execute(f"SELECT COUNT(*) FROM bids {exclude_clause}")
        total = c.fetchone()[0] or 0
        c.execute(f"SELECT COUNT(*) FROM bids WHERE status='applied' {('AND excluded_from_stats = 0' if has_excluded else '')}")
        applied = c.fetchone()[0] or 0
        c.execute(f"SELECT COUNT(*) FROM bids WHERE status='won' {('AND excluded_from_stats = 0' if has_excluded else '')}")
        won = c.fetchone()[0] or 0
        c.execute(f"SELECT COUNT(*) FROM bids WHERE reply_count > 0 {('AND excluded_from_stats = 0' if has_excluded else '')}")
        replies = c.fetchone()[0] or 0
        
        # Calculate totals with currency conversion to USD
        # Check if currency_code column exists
        has_currency = 'currency_code' in columns
        
        if has_currency:
            exclude_where = "WHERE bid_amount IS NOT NULL" + (" AND excluded_from_stats = 0" if has_excluded else "")
            c.execute(f"SELECT bid_amount, COALESCE(currency_code, 'USD') as currency_code FROM bids {exclude_where}")
        else:
            exclude_where = "WHERE bid_amount IS NOT NULL" + (" AND excluded_from_stats = 0" if has_excluded else "")
            c.execute(f"SELECT bid_amount FROM bids {exclude_where}")
        bid_rows = c.fetchall()
        total_value = 0.0
        for row in bid_rows:
            bid_amount = row[0]
            currency_code = row[1] if has_currency and len(row) > 1 else 'USD'
            total_value += convert_to_usd(bid_amount, currency_code)
        
        if has_currency:
            exclude_where = "WHERE profit IS NOT NULL" + (" AND excluded_from_stats = 0" if has_excluded else "")
            c.execute(f"SELECT profit, COALESCE(currency_code, 'USD') as currency_code FROM bids {exclude_where}")
        else:
            exclude_where = "WHERE profit IS NOT NULL" + (" AND excluded_from_stats = 0" if has_excluded else "")
            c.execute(f"SELECT profit FROM bids {exclude_where}")
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
        
        # Check which columns exist in bids table
        c.execute("PRAGMA table_info(bids)")
        columns = [col[1] for col in c.fetchall()]
        has_prompt_id = 'prompt_id' in columns
        has_prompt_hash = 'prompt_hash' in columns
        
        # Get all prompts
        c.execute("SELECT id FROM prompts")
        prompt_ids = [row[0] for row in c.fetchall()]
        
        for prompt_id in prompt_ids:
            bids_count = 0
            replies_count = 0
            won_count = 0
            
            if has_prompt_id:
                # Use prompt_id (newer system)
                c.execute("""SELECT COUNT(*), 
                           SUM(CASE WHEN reply_count > 0 THEN 1 ELSE 0 END), 
                           SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) 
                           FROM bids WHERE prompt_id = ?""", (prompt_id,))
                stats = c.fetchone()
                if stats:
                    bids_count = stats[0] or 0
                    replies_count = stats[1] or 0
                    won_count = stats[2] or 0
            elif has_prompt_hash:
                # Fall back to prompt_hash (older system for backward compatibility)
                c.execute("SELECT template FROM prompts WHERE id = ?", (prompt_id,))
                result = c.fetchone()
                if result:
                    import hashlib
                    prompt_hash = hashlib.md5(result[0].encode('utf-8')).hexdigest()[:16]
                    c.execute("""SELECT COUNT(*), 
                               SUM(CASE WHEN reply_count > 0 THEN 1 ELSE 0 END), 
                               SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) 
                               FROM bids WHERE prompt_hash = ?""", (prompt_hash,))
                    stats = c.fetchone()
                    if stats:
                        bids_count = stats[0] or 0
                        replies_count = stats[1] or 0
                        won_count = stats[2] or 0
            
            # Update stats for this prompt
            c.execute("UPDATE prompts SET stats_bids = ?, stats_replies = ?, stats_won = ? WHERE id = ?",
                     (bids_count, replies_count, won_count, prompt_id))
        
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error syncing prompt stats: {e}")
        import traceback
        traceback.print_exc()

@app.route('/analytics/prompts', methods=['GET'])
def get_prompt_analytics():
    """Get prompt performance analytics - includes all prompts, even with no bids"""
    try:
        import hashlib
        conn = sqlite3.connect(BIDS_DB)
        c = conn.cursor()
        
        # Ensure tables exist
        init_prompts_table()
        init_prompt_metadata_table()
        
        # Check which columns exist in bids table
        c.execute("PRAGMA table_info(bids)")
        columns = [col[1] for col in c.fetchall()]
        has_prompt_id = 'prompt_id' in columns
        has_prompt_hash = 'prompt_hash' in columns
        
        # Get all prompts from prompts table
        c.execute("SELECT id, name, template, created_at FROM prompts")
        all_prompts = c.fetchall()
        
        # Create a map of prompt_id -> prompt info and prompt_hash -> prompt info (for backward compatibility)
        prompt_id_map = {}
        prompt_hash_map = {}
        for prompt_id, prompt_name, template, created_at in all_prompts:
            prompt_id_map[prompt_id] = {
                'name': prompt_name,
                'created_at': created_at,
                'id': prompt_id
            }
            if has_prompt_hash:
                prompt_hash = hashlib.md5(template.encode('utf-8')).hexdigest()[:16]
                prompt_hash_map[prompt_hash] = {
                    'name': prompt_name,
                    'created_at': created_at,
                    'id': prompt_id
                }
        
        analytics_dict = {}
        
        if has_prompt_id:
            # Use prompt_id (newer system) - join with prompts table to get names
            c.execute("""
                SELECT 
                    b.prompt_id,
                    COUNT(*) as total_bids,
                    SUM(CASE WHEN b.reply_count > 0 THEN 1 ELSE 0 END) as total_replies,
                    SUM(CASE WHEN b.status = 'won' THEN 1 ELSE 0 END) as total_won,
                    ROUND(AVG(CASE WHEN b.reply_count > 0 THEN 1.0 ELSE 0.0 END) * 100, 2) as reply_rate,
                    MIN(b.applied_at) as first_used,
                    MAX(b.applied_at) as last_used,
                    p.name as prompt_name
                FROM bids b
                LEFT JOIN prompts p ON b.prompt_id = p.id
                WHERE b.prompt_id IS NOT NULL
                GROUP BY b.prompt_id
            """)
            
            bid_results = c.fetchall()
            
            # Create analytics dict from bids data
            for row in bid_results:
                prompt_id, total_bids, total_replies, total_won, reply_rate, first_used, last_used, prompt_name = row
                # Generate hash from prompt template for display purposes
                prompt_info = prompt_id_map.get(prompt_id, {})
                prompt_hash = None
                # Get template from prompts table to generate hash
                c.execute("SELECT template FROM prompts WHERE id = ?", (prompt_id,))
                template_result = c.fetchone()
                if template_result:
                    prompt_hash = hashlib.md5(template_result[0].encode('utf-8')).hexdigest()[:16]
                
                # Use prompt_id as key
                analytics_dict[prompt_id] = {
                    'prompt_id': prompt_id,
                    'prompt_hash': prompt_hash or f'id_{prompt_id}',  # Generate hash or use id as fallback
                    'prompt_name': prompt_name or prompt_info.get('name', f'Prompt {prompt_id}'),
                    'total_bids': total_bids or 0,
                    'total_replies': total_replies or 0,
                    'total_won': total_won or 0,
                    'reply_rate': reply_rate or 0.0,
                    'first_used': first_used,
                    'last_used': last_used
                }
        
        # Also check prompt_hash for backward compatibility (if column exists and we have bids with hash but no prompt_id)
        if has_prompt_hash:
            c.execute("""
                SELECT 
                    COALESCE(b.prompt_hash, 'unknown') as prompt_hash,
                    COUNT(*) as total_bids,
                    SUM(CASE WHEN b.reply_count > 0 THEN 1 ELSE 0 END) as total_replies,
                    SUM(CASE WHEN b.status = 'won' THEN 1 ELSE 0 END) as total_won,
                    ROUND(AVG(CASE WHEN b.reply_count > 0 THEN 1.0 ELSE 0.0 END) * 100, 2) as reply_rate,
                    MIN(b.applied_at) as first_used,
                    MAX(b.applied_at) as last_used
                FROM bids b
                WHERE b.prompt_hash IS NOT NULL
                AND (b.prompt_id IS NULL OR b.prompt_id = 0)
                GROUP BY b.prompt_hash
            """)
            
            hash_results = c.fetchall()
            
            # Add hash-based analytics (only if not already covered by prompt_id)
            for row in hash_results:
                prompt_hash, total_bids, total_replies, total_won, reply_rate, first_used, last_used = row
                # Use hash as key (prefixed to avoid conflicts)
                hash_key = f"hash_{prompt_hash}"
                if hash_key not in analytics_dict:
                    analytics_dict[hash_key] = {
                        'prompt_id': None,
                        'prompt_hash': prompt_hash,
                        'prompt_name': prompt_hash_map.get(prompt_hash, {}).get('name', f'Hash: {prompt_hash}'),
                        'total_bids': total_bids or 0,
                        'total_replies': total_replies or 0,
                        'total_won': total_won or 0,
                        'reply_rate': reply_rate or 0.0,
                        'first_used': first_used,
                        'last_used': last_used
                    }
        
        # Add all prompts from prompts table, even if they have no bids
        for prompt_id, prompt_info in prompt_id_map.items():
            if prompt_id not in analytics_dict:
                # Generate hash from template for display
                c.execute("SELECT template FROM prompts WHERE id = ?", (prompt_id,))
                template_result = c.fetchone()
                prompt_hash = None
                if template_result:
                    prompt_hash = hashlib.md5(template_result[0].encode('utf-8')).hexdigest()[:16]
                
                analytics_dict[prompt_id] = {
                    'prompt_id': prompt_id,
                    'prompt_hash': prompt_hash or f'id_{prompt_id}',
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
        
        # Open log file for appending (keep it open for the process)
        log_file_handle = open(LOG_FILE, 'a', encoding='utf-8')
        
        autobidder_process = subprocess.Popen(
            ['python', 'autobidder.py'],
            stdout=log_file_handle,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )
        
        # Give it a moment to start and check if it failed immediately
        import time
        time.sleep(0.5)
        if autobidder_process.poll() is not None:
            # Process exited immediately - read the log to see why
            log_file_handle.flush()
            log_file_handle.close()
            with open(LOG_FILE, 'r', encoding='utf-8') as f:
                error_output = f.read()
            autobidder_process = None
            error_msg = f"Process exited immediately. Log output: {error_output[:500]}"
            print(f"Autobidder failed to start: {error_msg}")
            return jsonify({'success': False, 'error': error_msg}), 500
        
        autobidder_running = True
        print(f"Autobidder process started with PID: {autobidder_process.pid}")
        return jsonify({'success': True, 'message': 'Autobidder started'})
    except Exception as e:
        import traceback
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(f"Error starting autobidder: {error_msg}")
        if 'log_file_handle' in locals():
            try:
                log_file_handle.close()
            except:
                pass
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/autobidder/stop', methods=['POST'])
@app.route('/api/autobidder/stop', methods=['POST'])  # Also accept /api prefix
def stop_autobidder():
    """Stop autobidder (works for both API-started and externally-started processes)"""
    global autobidder_process, autobidder_running
    
    stopped = False
    error_details = []
    
    # Create stop flag file first (works even if process was started externally)
    try:
        import os
        stop_flag_file = "autobidder_stop.flag"
        with open(stop_flag_file, 'w') as f:
            f.write("stop")
        error_details.append("Stop flag file created")
    except Exception as e:
        error_details.append(f"Could not create stop flag: {str(e)}")
    
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

@app.route('/projects/map', methods=['GET'])
@app.route('/api/projects/map', methods=['GET'])
def get_projects_for_map():
    """Get active projects with location data for map display. Optional skills filter via query param."""
    try:
        config = read_config_file()
        oauth_token = config.get('OAUTH_TOKEN')
        
        if not oauth_token:
            return jsonify({'success': False, 'error': 'No OAUTH_TOKEN configured'}), 500
        
        if not FREELANCER_SDK_AVAILABLE:
            return jsonify({'success': False, 'error': 'Freelancer SDK not available'}), 500
        
        # Get skills filter from query params (comma-separated)
        # If 'skills' parameter is provided, we MUST filter by it (even if empty)
        skills_filter = request.args.get('skills', None)
        filter_skills = []
        require_skills_filter = False
        
        if skills_filter is not None:
            # Skills parameter was provided - we must filter
            require_skills_filter = True
            filter_skills = [s.strip().lower() for s in skills_filter.split(',') if s.strip()]
            print(f"DEBUG: Filtering by skills: {filter_skills}")
        
        session = Session(oauth_token=oauth_token)
        
        # Fetch active projects
        url = 'https://www.freelancer.com/api/projects/0.1/projects/active/'
        params = {
            'limit': 500,  # Get more for map
            'full_description': False,
            'job_details': True,
            'user_details': True,  # Need user details for location
        }
        response = session.session.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        projects = data.get('result', {}).get('projects', [])
        
        print(f"DEBUG: Fetched {len(projects)} projects for map, require_skills_filter={require_skills_filter}")
        
        filtered_projects = []
        
        for p in projects:
            # Check if project has skills that match filter
            jobs = p.get('jobs', []) or []
            project_skills = [j.get('name', '').lower().strip() for j in jobs if j.get('name')]
            
            # If skills filter is required, only include projects that match
            if require_skills_filter:
                if not filter_skills:
                    # Skills parameter was provided but empty - return no projects
                    continue
                overlap = set(filter_skills).intersection(project_skills)
                if not overlap:
                    continue
            
            # Extract location data - try multiple sources
            owner = p.get('owner', {}) or {}
            location = owner.get('location', {}) or {}
            
            # Also check project-level location data
            project_location = p.get('location', {}) or {}
            
            # Try to get coordinates from location
            lat = None
            lon = None
            city = location.get('city', '') or project_location.get('city', '') or owner.get('city', '')
            country = location.get('country', '') or project_location.get('country', '') or owner.get('country', '')
            
            # If still no location, try to get from owner's profile
            if not city and not country:
                owner_profile = owner.get('profile', {}) or {}
                city = owner_profile.get('city', '')
                country = owner_profile.get('country', '')
            
            # Debug: log first few projects to see what data we have
            if len(filtered_projects) < 3:
                print(f"DEBUG Project {p.get('id')}: city='{city}', country='{country}', owner keys={list(owner.keys()) if owner else 'None'}")
            
            # If we have city/country but no coordinates, we'll need geocoding
            # For now, return what we have and frontend can handle geocoding if needed
            project_data = {
                'id': p.get('id'),
                'title': p.get('title', ''),
                'budget': p.get('budget', {}),
                'currency_code': p.get('currency', {}).get('code', 'USD') if isinstance(p.get('currency'), dict) else 'USD',
                'skills': [j.get('name', '') for j in jobs],
                'location': {
                    'city': city,
                    'country': country,
                    'lat': lat,
                    'lon': lon,
                },
                'bid_count': p.get('bid_stats', {}).get('bid_count', 0),
                'time_submitted': p.get('time_submitted', 0),
            }
            filtered_projects.append(project_data)
        
        return jsonify({
            'success': True,
            'projects': filtered_projects,
            'count': len(filtered_projects)
        })
    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc() if app.debug else None
        }), 500

# --- Fourcee website scrape callbacks (async n8n → web UI) ---
_scrape_jobs = {}
_scrape_jobs_lock = threading.Lock()
_SCRAPE_JOB_TTL_SEC = 3600


def _prune_scrape_jobs():
    now = time.time()
    with _scrape_jobs_lock:
        stale = [k for k, v in _scrape_jobs.items() if now - v.get('received_at', now) > _SCRAPE_JOB_TTL_SEC]
        for k in stale:
            del _scrape_jobs[k]


@app.route('/scraper-callback/<job_id>', methods=['POST'])
@app.route('/api/scraper-callback/<job_id>', methods=['POST'])
def scraper_callback_receive(job_id):
    """n8n POSTs final scrape stats/results here after [FINAL] M1 Lead Scraper (Website) finishes."""
    _prune_scrape_jobs()
    data = request.get_json(force=True, silent=True)
    if data is None:
        data = {}
    with _scrape_jobs_lock:
        _scrape_jobs[job_id] = {
            'status': 'complete',
            'result': data,
            'received_at': time.time(),
        }
    return jsonify({'ok': True})


@app.route('/scraper-callback/<job_id>', methods=['GET'])
@app.route('/api/scraper-callback/<job_id>', methods=['GET'])
def scraper_callback_status(job_id):
    """Frontend polls until n8n has POSTed results for this job."""
    _prune_scrape_jobs()
    with _scrape_jobs_lock:
        entry = _scrape_jobs.get(job_id)
    if not entry:
        return jsonify({'status': 'pending'})
    return jsonify(entry)


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'API server is running'})

if __name__ == '__main__':
    print("Starting Autobidder API Server on http://localhost:8000")
    print("Make sure to update API_BASE_URL in mobile/services/api.js if needed")
    app.run(host='0.0.0.0', port=8000, debug=True)

