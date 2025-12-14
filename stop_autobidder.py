#!/usr/bin/env python3
"""Utility to stop autobidder by creating stop file"""
import os

STOP_FILE = '.autobidder_stop'

# Create stop file
with open(STOP_FILE, 'w') as f:
    f.write('stop')
print(f"Stop file created: {STOP_FILE}")
print("Autobidder will stop on next loop iteration")

