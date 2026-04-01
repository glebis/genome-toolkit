"""Tests for triage task executor."""
from __future__ import annotations

import pytest

from genome_toolkit.triage.execution.executor import (
    AutomationLevel,
    ExecutionPlan,
    classify_all,
    classify_task,
)


class TestClassifyTask:
    def test_create_gene_note_is_auto(self):
        plan = classify_task("Create NAT2 gene note", "vault-maintenance")
        assert plan.level == AutomationLevel.AUTO
        assert plan.command == "/new-gene NAT2"
        assert plan.action == "Create gene note for NAT2"

    def test_update_note_is_semi(self):
        plan = classify_task("Update FADS1 gene note with GWAS data", "vault-maintenance")
        assert plan.level == AutomationLevel.SEMI
        assert "FADS1 gene" in plan.action
        assert plan.command is None

    def test_prescriber_context_is_always_manual(self):
        plan = classify_task("Request CRP blood test", "prescriber")
        assert plan.level == AutomationLevel.MANUAL
        assert plan.command is None

    def test_prescriber_context_uppercase_is_manual(self):
        plan = classify_task("Request CRP blood test", "PRESCRIBER")
        assert plan.level == AutomationLevel.MANUAL

    def test_testing_context_is_always_manual(self):
        plan = classify_task("Confirm HLA-B27 serology", "testing")
        assert plan.level == AutomationLevel.MANUAL

    def test_run_pubmed_is_auto(self):
        plan = classify_task("Run PubMed scan for new publications", "research")
        assert plan.level == AutomationLevel.AUTO
        assert plan.command == "python3 data/scripts/pubmed_monitor.py"

    def test_check_literature_is_semi_via_default(self):
        plan = classify_task("Check telomere PRS literature", "research")
        assert plan.level == AutomationLevel.SEMI

    def test_import_lab_results_is_semi(self):
        plan = classify_task("Import lab results from PDF", "monitoring")
        assert plan.level == AutomationLevel.SEMI
        assert plan.command == "/biomarker"

    def test_incorporate_finding_is_semi(self):
        plan = classify_task(
            "Incorporate FADS1 finding into Systems/Lipid Metabolism.md",
            "vault-maintenance",
        )
        assert plan.level == AutomationLevel.SEMI
        assert "Incorporate finding" in plan.action

    def test_run_audit_is_auto(self):
        plan = classify_task("Run vault audit", "vault-maintenance")
        assert plan.level == AutomationLevel.AUTO
        assert plan.command == "/genome-audit"

    def test_unknown_context_defaults_to_manual(self):
        plan = classify_task("Something unexpected", "unknown")
        assert plan.level == AutomationLevel.MANUAL

    def test_vault_maintenance_unknown_pattern_defaults_to_semi(self):
        plan = classify_task("Review broken links report", "vault-maintenance")
        assert plan.level == AutomationLevel.SEMI

    def test_create_gene_note_case_insensitive(self):
        plan = classify_task("create cyp2d6 gene note", "vault-maintenance")
        assert plan.level == AutomationLevel.AUTO
        assert "cyp2d6" in plan.command.lower()


class TestClassifyAll:
    def test_groups_by_level(self):
        items = [
            {"text": "Create NAT2 gene note", "context": "vault-maintenance"},
            {"text": "Update FADS1 gene note", "context": "vault-maintenance"},
            {"text": "Request CRP blood test", "context": "prescriber"},
            {"text": "Run PubMed scan", "context": "research"},
        ]
        result = classify_all(items)
        assert len(result[AutomationLevel.AUTO]) == 2  # NAT2 + PubMed
        assert len(result[AutomationLevel.SEMI]) == 1  # FADS1 update
        assert len(result[AutomationLevel.MANUAL]) == 1  # CRP

    def test_empty_list(self):
        result = classify_all([])
        assert result[AutomationLevel.AUTO] == []
        assert result[AutomationLevel.SEMI] == []
        assert result[AutomationLevel.MANUAL] == []

    def test_missing_context_defaults(self):
        items = [{"text": "Something random"}]
        result = classify_all(items)
        assert len(result[AutomationLevel.MANUAL]) == 1
