"""Hermes entry point for the deterministic Obsidian radar router."""

from .router import handle_pre_gateway_dispatch


def register(ctx):
    ctx.register_hook("pre_gateway_dispatch", handle_pre_gateway_dispatch)
