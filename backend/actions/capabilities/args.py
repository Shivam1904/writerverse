"""Turn a capability's `args` spec into a pydantic model, and check args with it.

`Capability.args` is a small dict of type strings, e.g.
`{"scene_id": "string", "limit": "int?"}`. A trailing `?` means optional.
Known types: string/str, int/integer, float, bool/boolean, list, dict/object,
any. An unknown type name is treated as `any` (no check).

One model per capability, built once and cached. Two users:
  - Night Eyes binds it as the tool's `args_schema` (what the LLM sees).
  - `dispatch()` calls `check_args()` for EVERY actor, so a wrong type is a
    clean 400 instead of a crash deep in gather (a missing required arg is a
    400 for the AI, a logged warning for everyone else; see check_args).

The check only rejects garbage; it does not rewrite args. Extra keys are
allowed (the frontend sends some), "5" still passes as an int, and a number
passes as a string (ids are often declared "string" but sent as numbers).
"""
from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel, ConfigDict, ValidationError, create_model

from .spec import Capability, CapabilityError

logger = logging.getLogger("writerverse.consistency")

_TYPE_MAP: dict[str, Any] = {
    "string": str,
    "str": str,
    "int": int,
    "integer": int,
    "float": float,
    "bool": bool,
    "boolean": bool,
    "list": list,
    "dict": dict,
    "object": dict,
    "any": Any,
}

_CONFIG = ConfigDict(extra="ignore", coerce_numbers_to_str=True)

_CACHE: dict[tuple[str, tuple[tuple[str, str], ...]], type[BaseModel]] = {}


def args_model(cap: Capability) -> type[BaseModel]:
    """The pydantic model for `cap.args`. Always a model, even with zero
    fields: LangChain needs an explicit schema for zero-arg tools, or it
    invents a single `kwargs` field the LLM then fills in."""
    key = (cap.name, tuple(sorted((cap.args or {}).items())))
    model = _CACHE.get(key)
    if model is None:
        fields: dict[str, Any] = {}
        for arg_name, type_hint in (cap.args or {}).items():
            optional = type_hint.endswith("?")
            py_type = _TYPE_MAP.get(type_hint.rstrip("?").strip().lower(), Any)
            if optional:
                fields[arg_name] = (py_type | None, None)
            else:
                fields[arg_name] = (py_type, ...)
        model = create_model(f"{cap.name}_args", __config__=_CONFIG, **fields)
        _CACHE[key] = model
    return model


def check_args(cap: Capability, args: Any, *, require: bool = True) -> None:
    """Raise CapabilityError(400) naming the first bad arg. Returns nothing:
    the caller keeps passing the ORIGINAL args on.

    A wrong type is always a 400. A missing (or null) required arg is a 400
    only when `require` is True; otherwise it is logged. Some register files
    declare args the frontend never sends (aliases like `name` for `title`,
    or a whole config sent as the args), so dispatch only requires them from
    the AI until those specs are fixed."""
    if not isinstance(args, dict):
        raise CapabilityError(
            f"{cap.name}: args must be an object, got {type(args).__name__}",
            400, code="bad_args",
        )
    try:
        args_model(cap).model_validate(args)
    except ValidationError as exc:
        missing: list[str] = []
        for err in exc.errors():
            loc = err.get("loc", ())
            arg = ".".join(str(p) for p in loc) or "?"
            top = loc[0] if loc else None
            if err.get("type") == "missing" or (
                len(loc) == 1 and args.get(top) is None
            ):
                missing.append(arg)
                continue
            msg = f"{cap.name}: bad argument '{arg}': {err.get('msg', 'invalid value')}"
            raise CapabilityError(msg, 400, code="bad_args") from None
        if require:
            raise CapabilityError(
                f"{cap.name}: missing required argument '{missing[0]}'",
                400, code="bad_args",
            ) from None
        logger.warning(
            "capability %s called without required args %s", cap.name, missing,
        )
