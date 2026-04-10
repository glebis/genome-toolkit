"""Validator wrappers for multi-agent consensus.

Each module exposes a single ``validate(claim, context) -> AgentResult``
function that can be used standalone or composed by the orchestration layer
in ``scripts/lib/multi_agent.py``.

Available validators
--------------------
codex_validator
    Wraps the Codex CLI for cross-model (GPT-class) validation.
pubmed_validator
    Searches PubMed for literature supporting or contradicting a claim.
notebooklm_validator
    Uses the NotebookLM skill for source-grounded document checking.
"""
from scripts.lib.validators.codex_validator import validate as codex_validate
from scripts.lib.validators.notebooklm_validator import validate as notebooklm_validate
from scripts.lib.validators.pubmed_validator import validate as pubmed_validate

__all__ = [
    "codex_validate",
    "notebooklm_validate",
    "pubmed_validate",
]
