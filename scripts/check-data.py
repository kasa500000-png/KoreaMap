#!/usr/bin/env python3
"""No network: validate rights/provenance and inspect actual npm archive bytes."""
import argparse
import json
from pathlib import Path
import sys
from data_policy import check_repository, check_tarball, expected_package, select_source, SDK

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--staged', action='store_true')
    parser.add_argument('--artifacts', action='store_true')
    parser.add_argument('--select')
    parser.add_argument('--purpose', choices=['collect', 'external-api'], default='collect')
    parser.add_argument('--operator-opt-in', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    files, sources = check_repository(root, args.staged)
    print(f'PASS data policy: {sources} sources, {files} files, scope={"index" if args.staged else "worktree"}')
    if args.select:
        catalog = json.loads((root / 'data/sources.json').read_text(encoding='utf-8'))
        s = select_source(catalog, args.select, args.purpose, operator_opt_in=args.operator_opt_in)
        print(f'ELIGIBLE ONLY: {s["id"]}; grade={s["grade"]}; purpose={args.purpose}; no requests or downloads performed')
    if args.artifacts:
        paths = sorted((root / 'artifacts').glob('*.tgz'))
        if len(paths) != len(SDK): raise ValueError('Expected exactly five tarballs')
        for name in SDK:
            candidates = [p for p in paths if p.name.startswith('korea-map-' + name + '-')]
            if len(candidates) != 1: raise ValueError('Missing/ambiguous tarball')
            digest = check_tarball(candidates[0], expected_package(root, name), name)
            print(f'PASS data publication: {candidates[0].name} sha256={digest}')

if __name__ == '__main__':
    try: main()
    except (ValueError, KeyError, TypeError, OSError, UnicodeError) as exc:
        print('FAIL data policy: ' + str(exc), file=sys.stderr)
        sys.exit(1)
