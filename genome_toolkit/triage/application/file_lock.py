from __future__ import annotations

import fcntl
import time
from pathlib import Path
from types import TracebackType


class LockError(Exception):
    """Raised when an advisory file lock cannot be acquired within timeout."""


class FileLock:
    """Advisory file lock using fcntl.flock().

    Usage::

        with FileLock(Path("/tmp/.triage.lock"), timeout=5.0):
            # critical section
            ...
    """

    def __init__(self, lock_path: Path, timeout: float = 5.0) -> None:
        self._lock_path = lock_path
        self._timeout = timeout
        self._fd: int | None = None

    def __enter__(self) -> FileLock:
        self._lock_path.parent.mkdir(parents=True, exist_ok=True)
        self._fd = open(self._lock_path, "w")  # noqa: SIM115
        deadline = time.monotonic() + self._timeout
        while True:
            try:
                fcntl.flock(self._fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return self
            except (OSError, BlockingIOError):
                if time.monotonic() >= deadline:
                    self._fd.close()
                    self._fd = None
                    raise LockError(
                        f"Could not acquire lock on {self._lock_path} "
                        f"within {self._timeout}s — another triage session is active"
                    )
                time.sleep(0.05)

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        if self._fd is not None:
            fcntl.flock(self._fd, fcntl.LOCK_UN)
            self._fd.close()
            self._fd = None
            self._lock_path.unlink(missing_ok=True)
