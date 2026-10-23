#!/usr/bin/env python3
"""Validate planning snapshots and local documentation; no product tests run."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "docs/baselines/v0.1"
ERRORS: list[str] = []


def error(message: str) -> None:
    ERRORS.append(message)


def rows(path: Path, prefix: str) -> list[list[str]]:
    return [
        [cell.strip() for cell in line.strip().strip("|").split("|")]
        for line in path.read_text().splitlines()
        if re.match(rf"^\| {prefix}-\d{{3}} \|", line)
    ]


manifest = json.loads((BASELINE / "manifest.json").read_text())
seen_snapshots: set[str] = set()
for entry in manifest["files"]:
    relative = entry["snapshot"]
    if relative in seen_snapshots:
        error(f"Duplicate baseline path: {relative}")
    seen_snapshots.add(relative)
    path = (BASELINE / relative).resolve()
    if not path.is_relative_to(BASELINE.resolve()) or not path.is_file():
        error(f"Missing/invalid baseline file: {relative}")
        continue
    data = path.read_bytes()
    if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
        error(f"Baseline changed: {relative}; do not regenerate hashes to hide edits")

# Historical copied Markdown is byte-preserved and may contain pre-existing links.
# Validate the new baseline README, but not the copied historical source documents.
documents = [ROOT / "README.md", *sorted((ROOT / "docs").rglob("*.md")),
             ROOT / ".github/pull_request_template.md"]
documents = [p for p in documents if not p.is_relative_to(BASELINE / "writeup")]
link_count = 0
for document in documents:
    if not document.is_file():
        error(f"Missing document: {document.relative_to(ROOT)}")
        continue
    content = re.sub(r"```.*?```", "", document.read_text(), flags=re.S)
    for match in re.finditer(r"\[[^\]\n]*\]\(([^)\n]+)\)", content):
        raw = match.group(1).strip().strip("<>")
        parsed = urlsplit(raw)
        if parsed.scheme or raw.startswith("#"):
            continue
        target = (document.parent / unquote(parsed.path)).resolve()
        link_count += 1
        if not target.exists():
            error(f"Broken link in {document.relative_to(ROOT)}: {raw}")

requirement_pattern = r"(?:FLOW|SCOR|FEED|TUTR|REVI|CORE)-\d{3}"
requirements: dict[str, str] = {}
for path in (ROOT / "docs/specs").glob("*.md"):
    for identifier in re.findall(rf"^## ({requirement_pattern})\b", path.read_text(), re.M):
        if identifier in requirements:
            error(f"Duplicate requirement: {identifier}")
        requirements[identifier] = path.name

agent_roles = set(re.findall(r"^\| (AG-[A-Z]+) \|", (ROOT / "docs/organization.md").read_text(), re.M))
if not agent_roles:
    error("No agent roles defined in docs/organization.md")
human_roles = {"创始人", "评分专家"}

task_path = ROOT / "docs/tracking/tasks.md"
task_rows = rows(task_path, "MVP")
tasks: dict[str, list[str]] = {}
implementation_states = {"backlog", "ready", "in_progress", "review", "done", "blocked", "deferred"}
verification_states = {"not_run", "running", "passed", "failed", "inconclusive"}
for cells in task_rows:
    if len(cells) != 8:
        error(f"Task table needs 8 columns: {cells}")
        continue
    identifier = cells[0]
    if identifier in tasks:
        error(f"Duplicate task: {identifier}")
    tasks[identifier] = cells
    if cells[4] not in implementation_states or cells[5] not in verification_states:
        error(f"Invalid task state: {identifier}")
    if (cells[4] == "done" or cells[5] == "passed") and cells[7] in {"—", "", "-"}:
        error(f"Completed/verified task needs evidence: {identifier}")
    executor, _, approver = cells[3].partition("／")
    executors = [part.strip() for part in executor.split("＋")]
    if approver.strip() != "创始人":
        error(f"Task approver must be 创始人: {identifier}")
    unknown = [part for part in executors if part not in agent_roles | human_roles]
    if unknown or not any(part in agent_roles or part == "创始人" for part in executors):
        error(f"Task executor must use roles from docs/organization.md: {identifier} {unknown}")

cards = re.findall(r"^### (MVP-\d{3})\b", task_path.read_text(), re.M)
if len(cards) != len(set(cards)) or set(cards) != set(tasks):
    error("Task table and detailed cards do not match uniquely")

dependencies: dict[str, list[str]] = {}
for identifier, cells in tasks.items():
    dependencies[identifier] = re.findall(r"MVP-\d{3}", cells[6])
    for dependency in dependencies[identifier]:
        if dependency not in tasks:
            error(f"Unknown dependency: {identifier} -> {dependency}")
        elif cells[4] in {"ready", "in_progress", "review", "done"} and tasks[dependency][4] != "done":
            error(f"Task {identifier} is {cells[4]} while dependency {dependency} is not done")

visited: set[str] = set()
active: set[str] = set()


def visit(identifier: str) -> None:
    if identifier in active:
        error(f"Task dependency cycle at {identifier}")
        return
    if identifier in visited:
        return
    active.add(identifier)
    for dependency in dependencies.get(identifier, []):
        visit(dependency)
    active.remove(identifier)
    visited.add(identifier)


for identifier in tasks:
    visit(identifier)

acceptance_rows = rows(ROOT / "docs/validation/acceptance.md", "AC")
acceptance_ids: set[str] = set()
covered_requirements: set[str] = set()
covered_tasks: set[str] = set()
for cells in acceptance_rows:
    if len(cells) != 8:
        error(f"Acceptance table needs 8 columns: {cells}")
        continue
    identifier = cells[0]
    if identifier in acceptance_ids:
        error(f"Duplicate acceptance ID: {identifier}")
    acceptance_ids.add(identifier)
    if cells[1] not in {"P0", "P1", "P2"} or cells[6] not in verification_states:
        error(f"Invalid acceptance priority/state: {identifier}")
    required = set(re.findall(requirement_pattern, cells[2]))
    linked_tasks = set(re.findall(r"MVP-\d{3}", cells[3]))
    if not required or not linked_tasks:
        error(f"Acceptance needs requirements and tasks: {identifier}")
    for requirement in required:
        if requirement not in requirements:
            error(f"Unknown requirement in {identifier}: {requirement}")
    for task in linked_tasks:
        if task not in tasks:
            error(f"Unknown task in {identifier}: {task}")
    covered_requirements.update(required)
    covered_tasks.update(linked_tasks)
    if cells[6] in {"passed", "failed", "inconclusive"} and cells[7] in {"—", "", "-"}:
        error(f"Executed acceptance needs evidence: {identifier}")

for requirement in sorted(set(requirements) - covered_requirements):
    error(f"Requirement has no acceptance: {requirement}")
for task in sorted(set(tasks) - covered_tasks):
    error(f"Task has no acceptance: {task}")

# Validate exact IDs used anywhere in current specs and task cards (range endpoints included).
for path in [*sorted((ROOT / "docs/specs").glob("*.md")), task_path]:
    content = path.read_text()
    for prefix, known in [(requirement_pattern, set(requirements)), (r"MVP-\d{3}", set(tasks)),
                          (r"AC-\d{3}", acceptance_ids)]:
        for identifier in set(re.findall(prefix, content)) - known:
            error(f"Unknown identifier in {path.relative_to(ROOT)}: {identifier}")

if not requirements or not tasks or not acceptance_ids:
    error("Requirements, tasks and acceptance tables must not be empty")

if ERRORS:
    for message in ERRORS:
        print(f"ERROR: {message}")
    sys.exit(1)

print(f"PASS: {len(seen_snapshots)} frozen files match SHA-256 and size")
print(f"PASS: {len(documents)} current Markdown files, {link_count} local links")
print(f"PASS: {len(requirements)} requirements, {len(tasks)} tasks, {len(acceptance_ids)} acceptance checks")
print("PASS: task dependencies are acyclic; states and references are valid")
print(f"PASS: task executors use {len(agent_roles)} defined agent roles; approver is 创始人")
print("NOTE: documentation validation only; no product acceptance was executed")
