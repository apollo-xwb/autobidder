#!/usr/bin/env python3
"""
Helper script to generate environment variables for Render.com
Reads from config.py and outputs the environment variables you need to add in Render dashboard
"""

import os
import sys

def read_config():
    """Read config.py and extract values"""
    config = {}
    try:
        with open('config.py', 'r', encoding='utf-8') as f:
            code = f.read()
        namespace = {}
        exec(code, namespace)
        # Extract config variables
        builtins = set(dir(__builtins__)) if hasattr(__builtins__, '__dict__') else set()
        for key, value in namespace.items():
            if not key.startswith('_') and key not in builtins:
                config[key] = value
    except Exception as e:
        print(f"Error reading config.py: {e}")
        sys.exit(1)
    return config

def format_value(value):
    """Format value for environment variable"""
    if isinstance(value, list):
        # Convert list to comma-separated string
        return ','.join(str(item) for item in value)
    elif isinstance(value, str):
        return value
    else:
        return str(value)

def main():
    print("=" * 60)
    print("Render.com Environment Variables Generator")
    print("=" * 60)
    print()
    print("Copy these environment variables to your Render dashboard:")
    print("(Dashboard -> Your Service -> Environment -> Add Environment Variable)")
    print()
    print("-" * 60)
    
    config = read_config()
    
    # Required variables
    required_vars = [
        'OAUTH_TOKEN',
        'YOUR_BIDDER_ID',
        'GEMINI_API_KEY',
        'TELEGRAM_TOKEN',
        'TELEGRAM_CHAT_ID',
    ]
    
    # Optional variables (with defaults)
    optional_vars = [
        'MIN_BUDGET',
        'POLL_INTERVAL',
        'BID_AMOUNT_MULTIPLIER',
        'DEFAULT_DELIVERY_DAYS',
        'MAX_PROJECT_AGE_MINUTES',
        'PROMPT_SELECTION_MODE',
        'MY_SKILLS',
    ]
    
    print("\n# Required Variables:")
    for var in required_vars:
        if var in config:
            value = format_value(config[var])
            print(f"{var}={value}")
        else:
            print(f"# {var} - MISSING! Add this manually")
    
    print("\n# Optional Variables (with defaults):")
    for var in optional_vars:
        if var in config:
            value = format_value(config[var])
            print(f"{var}={value}")
    
    print("\n# Render automatically sets:")
    print("PORT=8000")
    
    print()
    print("-" * 60)
    print("\n[OK] Copy the variables above and paste them in Render dashboard")
    print("   Dashboard -> Your Service -> Environment -> Add Environment Variable")
    print()
    print("[!] Note: MY_SKILLS will be comma-separated. The app will parse it correctly.")
    print()

if __name__ == '__main__':
    main()

