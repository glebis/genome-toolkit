"""Agent session management using Claude Agent SDK.

Each user chat session gets a ClaudeSDKClient that maintains conversation
context. Custom genome tools are provided via an in-process MCP server.
"""
import asyncio
from typing import AsyncIterator

from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ToolUseBlock,
)

from backend.app.agent.tools import create_genome_mcp_server

SYSTEM_PROMPT = """You are a genome data assistant for a personal genomics toolkit. You help users understand their genetic variants (SNPs), explain clinical significance, and navigate their data.

You have access to the user's genetic data through the genome MCP tools. Use them to query variants and update the UI table.

Guidelines:
- Be concise and scientifically accurate
- When discussing variants, mention the rsID, genotype, and what it means clinically
- Use update_table_view to filter the UI table when showing specific variants
- If asked about a gene, search for variants in that gene
- Explain significance in plain language
- Note when data is imputed (lower confidence) vs genotyped (directly measured)
- Format responses with markdown for readability"""

# MCP server config — created once, shared across sessions
_genome_mcp = None


def get_genome_mcp():
    global _genome_mcp
    if _genome_mcp is None:
        _genome_mcp = create_genome_mcp_server()
    return _genome_mcp


async def create_agent_session(cwd: str = ".") -> tuple[ClaudeSDKClient, str | None]:
    """Create a new Agent SDK client with genome tools.

    Returns (client, session_id).
    """
    mcp = get_genome_mcp()

    options = ClaudeAgentOptions(
        system_prompt=SYSTEM_PROMPT,
        mcp_servers={"genome": mcp},
        allowed_tools=[
            "mcp__genome__query_snps",
            "mcp__genome__get_snp_detail",
            "mcp__genome__get_genome_stats",
            "mcp__genome__update_table_view",
        ],
        permission_mode="bypassPermissions",
        max_turns=10,
        cwd=cwd,
    )

    client = ClaudeSDKClient(options=options)
    return client, None


async def stream_agent_response(
    client: ClaudeSDKClient,
    message: str,
) -> AsyncIterator[dict]:
    """Send a message to the agent and yield SSE-compatible events.

    Yields dicts with 'event' and 'data' keys.
    """
    await client.query(message)

    async for msg in client.receive_response():
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                if isinstance(block, TextBlock):
                    yield {
                        "event": "text_delta",
                        "data": {"content": block.text},
                    }
                elif isinstance(block, ToolUseBlock):
                    yield {
                        "event": "tool_call",
                        "data": {"tool": block.name, "args": block.input},
                    }
                    # Detect UI action tools
                    if block.name == "mcp__genome__update_table_view":
                        yield {
                            "event": "ui_action",
                            "data": {"action": "filter_table", "params": block.input},
                        }

        elif isinstance(msg, ResultMessage):
            yield {
                "event": "result",
                "data": {
                    "cost_usd": msg.total_cost_usd,
                    "turns": msg.num_turns,
                    "session_id": msg.session_id,
                },
            }

        elif isinstance(msg, SystemMessage) and msg.subtype == "init":
            yield {
                "event": "session_init",
                "data": {"agent_session_id": msg.data.get("session_id")},
            }

    yield {"event": "done", "data": {}}
