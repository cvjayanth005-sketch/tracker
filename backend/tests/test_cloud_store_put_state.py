from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone

import pytest

from app import cloud_store


class FakeCursor:
    """Records every statement; answers only the SELECTs put_state_document needs."""

    def __init__(self, sync_meta_version: int | None) -> None:
        self.sync_meta_version = sync_meta_version
        self.executed: list[str] = []

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def execute(self, sql: str, params: object = None) -> None:
        self.executed.append(sql.strip())

    def fetchone(self):
        last = self.executed[-1] if self.executed else ""
        if last.startswith("select version from sync_meta"):
            return {"version": self.sync_meta_version} if self.sync_meta_version is not None else None
        return None

    def fetchall(self):
        return []


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor

    def cursor(self) -> FakeCursor:
        return self._cursor


@pytest.fixture
def patched_connect(monkeypatch):
    def make(sync_meta_version: int | None):
        cursor = FakeCursor(sync_meta_version)

        @contextmanager
        def fake_connect():
            yield FakeConnection(cursor)

        monkeypatch.setattr(cloud_store, "connect", fake_connect)
        return cursor

    return make


def base_doc(**over: object) -> dict[str, object]:
    doc = {
        "version": 1,
        "updatedAt": "2026-01-01T00:00:00.000Z",
        "tables": {},
        "tombstones": [],
        "rowMerge": True,
    }
    doc.update(over)
    return doc


def test_row_merge_push_is_accepted_even_when_baseVersion_is_stale(patched_connect) -> None:
    """
    This is the exact shape of the original bug: two devices both moved past
    the version this push last saw. A row-merge push used to be refused
    outright here; it should now be accepted and merged.
    """
    patched_connect(sync_meta_version=9)
    doc = base_doc(version=3, baseVersion=0)

    result = cloud_store.put_state_document(doc, user_id=42)

    assert "conflict" not in result
    assert result["version"] == 10  # max(current=9, client's stale 3) + 1


def test_version_advances_from_the_larger_of_server_or_client(patched_connect) -> None:
    """The client's own counter can legitimately be ahead of what the server
    has recorded (e.g. after a dropped response); the new version must not
    regress below either side's idea of where things stand."""
    patched_connect(sync_meta_version=2)
    doc = base_doc(version=50, baseVersion=0)

    result = cloud_store.put_state_document(doc, user_id=42)

    assert result["version"] == 51  # max(current=2, client's 50) + 1


def test_row_merge_ignores_baseVersion_entirely(patched_connect) -> None:
    """baseVersion is no longer a gate for a merge push — it should not even
    need to match for the push to succeed."""
    patched_connect(sync_meta_version=5)
    doc = base_doc(version=1, baseVersion=999)

    result = cloud_store.put_state_document(doc, user_id=42)

    assert "conflict" not in result
    assert result["version"] == 6


def test_non_merge_push_still_enforces_the_version_gate(patched_connect) -> None:
    """The legacy whole-document replace path (only ever sent by an old or
    self-hosted client without tombstones) has no per-row safety net, so a
    stale baseVersion must still be refused."""
    patched_connect(sync_meta_version=9)
    doc = base_doc(version=3, baseVersion=0, rowMerge=False)

    result = cloud_store.put_state_document(doc, user_id=42)

    assert result == {"conflict": True, "serverVersion": 9}


def test_non_merge_push_succeeds_when_baseVersion_matches(patched_connect) -> None:
    patched_connect(sync_meta_version=9)
    doc = base_doc(version=10, baseVersion=9, rowMerge=False)

    result = cloud_store.put_state_document(doc, user_id=42)

    assert "conflict" not in result
    assert result["version"] == 10


def test_first_ever_push_for_a_user_has_no_prior_version_to_gate_on(patched_connect) -> None:
    """No sync_meta row yet means `_read_version` falls back through to 0 — the
    merge path should not treat "nothing recorded yet" as a conflict."""
    patched_connect(sync_meta_version=None)
    doc = base_doc(version=1, baseVersion=None)

    result = cloud_store.put_state_document(doc, user_id=42)

    assert "conflict" not in result
    assert result["version"] == 2  # max(current=0, client's 1) + 1

