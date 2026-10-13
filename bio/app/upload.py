"""In-memory multipart reader for `meta` JSON + `frame_NNN` JPEG parts.

Starlette's form parser spools file parts over 1 MB to a temp file on disk; frames must
never touch disk (docs/biometrics.md#privacy), so parts are collected in memory here with
hard caps on part size, part count and total body size.
"""

import re
from dataclasses import dataclass, field

from fastapi import HTTPException, Request
from pydantic import BaseModel, ValidationError
from python_multipart.multipart import MultipartParser, parse_options_header

from app.config import MAX_FRAME_BYTES, MAX_META_BYTES

FRAME_RE = re.compile(r"^frame_(\d{3})(?:\.jpg)?$")


@dataclass
class _Part:
    name: str = ""
    data: bytearray = field(default_factory=bytearray)


async def read_parts(request: Request, *, max_parts: int, max_part_bytes: int) -> list[_Part]:
    ctype, params = parse_options_header(request.headers.get("content-type", ""))
    boundary = params.get(b"boundary")
    if ctype != b"multipart/form-data" or not boundary:
        raise HTTPException(400, "expected multipart/form-data")

    max_body = max_parts * (max_part_bytes + 1024)
    parts: list[_Part] = []
    cur = _Part()
    hname = bytearray()
    hval = bytearray()
    headers: dict[bytes, bytes] = {}

    def on_part_begin() -> None:
        nonlocal cur
        cur = _Part()
        headers.clear()
        if len(parts) >= max_parts:
            raise HTTPException(400, "too many parts")

    def on_part_data(data: bytes, start: int, end: int) -> None:
        if len(cur.data) + (end - start) > max_part_bytes:
            raise HTTPException(413, "part too large")
        cur.data.extend(data[start:end])

    def on_header_field(data: bytes, start: int, end: int) -> None:
        hname.extend(data[start:end])

    def on_header_value(data: bytes, start: int, end: int) -> None:
        hval.extend(data[start:end])

    def on_header_end() -> None:
        headers[bytes(hname).lower()] = bytes(hval)
        hname.clear()
        hval.clear()

    def on_headers_finished() -> None:
        _, opts = parse_options_header(headers.get(b"content-disposition", b""))
        name = opts.get(b"name")
        if not name:
            raise HTTPException(400, "part without a name")
        cur.name = name.decode("latin-1")

    def on_part_end() -> None:
        parts.append(cur)

    parser = MultipartParser(
        boundary,
        {
            "on_part_begin": on_part_begin,
            "on_part_data": on_part_data,
            "on_part_end": on_part_end,
            "on_header_field": on_header_field,
            "on_header_value": on_header_value,
            "on_header_end": on_header_end,
            "on_headers_finished": on_headers_finished,
        },
    )
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > max_body:
            raise HTTPException(413, "body too large")
        parser.write(chunk)
    parser.finalize()
    return parts


async def read_upload[M: BaseModel](request: Request, meta_model: type[M], *, max_frames: int) -> tuple[M, list[bytes]]:
    """`meta` validated with `meta_model`, frames ordered by index (must be 000..n-1)."""
    parts = await read_parts(request, max_parts=max_frames + 1, max_part_bytes=max(MAX_FRAME_BYTES, MAX_META_BYTES))
    meta_raw: bytes | None = None
    frames: dict[int, bytes] = {}
    for p in parts:
        if p.name == "meta" and meta_raw is None:
            if len(p.data) > MAX_META_BYTES:
                raise HTTPException(413, "meta too large")
            meta_raw = bytes(p.data)
        elif (m := FRAME_RE.match(p.name)) and int(m.group(1)) not in frames:
            frames[int(m.group(1))] = bytes(p.data)
        else:
            raise HTTPException(400, "unexpected or duplicate part")
    if meta_raw is None:
        raise HTTPException(400, "missing meta")
    if sorted(frames) != list(range(len(frames))):
        raise HTTPException(400, "frame indices must be contiguous from 000")
    try:
        meta = meta_model.model_validate_json(meta_raw)
    except ValidationError:
        raise HTTPException(400, "invalid meta") from None  # never echo input back
    return meta, [frames[i] for i in range(len(frames))]
