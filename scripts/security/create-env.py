#!/usr/bin/env python3
"""Generate a private environment file from a secret-free repository template."""
import argparse
import os
from pathlib import Path
import secrets

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('template', type=Path)
parser.add_argument('destination', type=Path)
args = parser.parse_args()
os.umask(0o077)
lines = []
for line in args.template.read_text().splitlines():
    if '=' in line and not line.startswith('#'):
        key, value = line.split('=', 1)
        if any(part in key for part in ('PASSWORD', 'SECRET', 'TOKEN')):
            line = key + '=' + secrets.token_hex(32)
    lines.append(line)
# Exclusive creation prevents accidental credential rotation or overwrite.
with args.destination.open('x') as stream:
    stream.write('\n'.join(lines) + '\n')
print('Created private environment file; set ADMIN_EMAIL and review deployment paths/ports before use.')
