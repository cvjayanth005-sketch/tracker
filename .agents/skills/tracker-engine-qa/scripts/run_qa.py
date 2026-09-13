#!/usr/bin/env python3
"""
CLI Helper script for tracker-engine-qa skill.
Executes test sweeps, checks domain invariants, and generates JSON/DOCX QA reports.
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[4]
FRONTEND_DIR = PROJECT_ROOT / "frontend"
BACKEND_DIR = PROJECT_ROOT / "backend"


def run_command(cmd, cwd=None, env=None):
    start_time = time.monotonic()
    try:
        res = subprocess.run(
            cmd,
            cwd=cwd or PROJECT_ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env or os.environ.copy()
        )
        duration = round(time.monotonic() - start_time, 2)
        return {
            "status": "PASS" if res.returncode == 0 else "FAIL",
            "returncode": res.returncode,
            "duration_sec": duration,
            "stdout": res.stdout[-2000:] if res.stdout else "",
            "stderr": res.stderr[-2000:] if res.stderr else ""
        }
    except Exception as e:
        duration = round(time.monotonic() - start_time, 2)
        return {
            "status": "FAIL",
            "error": str(e),
            "duration_sec": duration,
            "stdout": "",
            "stderr": str(e)
        }


def cmd_verify(args):
    print("Running tracker verification suite...")
    results = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "frontend_build": run_command(["npm", "--prefix", "frontend", "run", "build"]),
        "frontend_test": run_command(["npm", "--prefix", "frontend", "run", "test"]),
        "frontend_lint": run_command(["npm", "--prefix", "frontend", "run", "lint"]),
        "backend_test": run_command(["pytest"], cwd=BACKEND_DIR),
    }

    all_passed = all(
        step.get("status") == "PASS"
        for step in [
            results["frontend_build"],
            results["frontend_test"],
            results["frontend_lint"],
            results["backend_test"]
        ]
    )
    results["overall_status"] = "PASS" if all_passed else "FAIL"

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"Verification complete. Overall status: {results['overall_status']}")
    print(f"Results written to: {output_path}")

    if not all_passed:
        sys.exit(1)


def cmd_check_invariants(args):
    print("Auditing domain rules and invariants...")
    domain_dir = FRONTEND_DIR / "src" / "domain"
    findings = []
    
    # 1. Check rules.ts for RULES_VERSION
    rules_file = domain_dir / "rules.ts"
    rules_version_found = False
    if rules_file.exists():
        content = rules_file.read_text(encoding="utf-8")
        if "RULES_VERSION" in content:
            rules_version_found = True
        else:
            findings.append("RULES_VERSION definition missing in frontend/src/domain/rules.ts")
    else:
        findings.append("rules.ts file not found in frontend/src/domain/")

    # 2. Check that domain ts files have corresponding test files
    ts_files = list(domain_dir.glob("*.ts"))
    untested = []
    for ts_file in ts_files:
        if ts_file.name.endswith(".test.ts") or ts_file.name in ("types.ts", "testUtils.ts", "seed.ts"):
            continue
        test_counterpart = domain_dir / f"{ts_file.stem}.test.ts"
        if not test_counterpart.exists():
            untested.append(ts_file.name)
            findings.append(f"Domain module without unit test file: {ts_file.name}")

    results = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "rules_version_found": rules_version_found,
        "untested_domain_modules": untested,
        "findings": findings,
        "status": "PASS" if not findings else "WARNING"
    }

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"Invariant audit complete. Status: {results['status']}")
    print(f"Audit report written to: {output_path}")


def cmd_generate_report(args):
    print("Generating DOCX QA Report...")
    summary_file = Path(args.summary).resolve()
    output_docx = Path(args.output).resolve()

    if not summary_file.exists():
        print(f"Error: Summary file '{summary_file}' does not exist. Run 'verify' first.")
        sys.exit(1)

    with open(summary_file, "r", encoding="utf-8") as f:
        summary_data = json.load(f)

    # Delegate to create_pawtrack_qa_report script if present
    script_path = PROJECT_ROOT / "create_pawtrack_qa_report.py"
    if script_path.exists():
        res = run_command(["uv", "run", "--with", "python-docx", "python", str(script_path)])
        print(f"DOCX report generator execution: {res['status']}")
        if res["status"] == "FAIL":
            print(f"Error details: {res['stderr']}")
            sys.exit(1)
    else:
        print("Note: create_pawtrack_qa_report.py not found at project root.")

    print(f"QA report generation completed. Document saved to: {output_docx}")


def main():
    parser = argparse.ArgumentParser(description="Tracker Engine QA Helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcommand: verify
    p_verify = subparsers.add_parser("verify", help="Run full-stack build, tests, and linter")
    p_verify.add_argument("--output", "-o", required=True, help="Path to write JSON verification output")
    p_verify.set_defaults(func=cmd_verify)

    # Subcommand: check-invariants
    p_inv = subparsers.add_parser("check-invariants", help="Audit domain TS invariants and RULES_VERSION")
    p_inv.add_argument("--output", "-o", required=True, help="Path to write JSON invariants output")
    p_inv.set_defaults(func=cmd_check_invariants)

    # Subcommand: generate-report
    p_rep = subparsers.add_parser("generate-report", help="Generate DOCX QA Report from verification summary")
    p_rep.add_argument("--summary", "-s", required=True, help="Path to JSON verification summary file")
    p_rep.add_argument("--output", "-o", required=True, help="Output path for DOCX report file")
    p_rep.set_defaults(func=cmd_generate_report)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
