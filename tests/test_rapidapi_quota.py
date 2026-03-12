"""Tests for RapidAPI quota management helpers."""
import json
import os
import tempfile
from unittest.mock import patch

import pytest


def test_monthly_usage_starts_at_zero(tmp_path):
    usage_file = str(tmp_path / "usage.json")
    with patch("backend.src.scrapers.rapidapi.settings") as mock_settings:
        mock_settings.rapidapi_usage_file = usage_file
        mock_settings.rapidapi_monthly_limit = 10

        from backend.src.scrapers.rapidapi import (
            _load_usage,
            _save_usage,
            get_monthly_usage,
            increment_monthly_usage,
            quota_remaining,
        )

        # Patch the module-level settings reference in the functions
        with patch("backend.src.scrapers.rapidapi.settings.rapidapi_usage_file", usage_file):
            with patch("backend.src.scrapers.rapidapi.settings.rapidapi_monthly_limit", 10):
                assert not os.path.exists(usage_file)
                usage = get_monthly_usage()
                assert usage == 0


def test_quota_tracking(tmp_path):
    """Test that quota increments correctly."""
    usage_file = str(tmp_path / "usage2.json")

    with patch("backend.src.scrapers.rapidapi.settings.rapidapi_usage_file", usage_file):
        with patch("backend.src.scrapers.rapidapi.settings.rapidapi_monthly_limit", 3):
            from backend.src.scrapers import rapidapi as r_module

            # Force reload of functions with patched settings
            remaining_before = r_module.quota_remaining()
            r_module.increment_monthly_usage()
            remaining_after = r_module.quota_remaining()
            assert remaining_after == remaining_before - 1


def test_load_usage_handles_corrupt_file(tmp_path):
    usage_file = str(tmp_path / "corrupt.json")
    with open(usage_file, "w") as f:
        f.write("not valid json{{{")

    with patch("backend.src.scrapers.rapidapi.settings.rapidapi_usage_file", usage_file):
        from backend.src.scrapers.rapidapi import _load_usage
        data = _load_usage()
        assert data == {}
