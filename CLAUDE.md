# CLAUDE.md

The project rules live in [AGENTS.md](AGENTS.md), which is the vendor-neutral
file most coding agents look for. Keeping one copy means the rules cannot drift
between tools, which matters here because several of them exist to stop an
agent doing the obvious-but-wrong thing.

This file is a pointer, not a second copy. Put project rules in `AGENTS.md`.
Anything genuinely specific to Claude Code, and nothing else, goes below the
import.

@AGENTS.md
