"""Save image/caption datasets with source-name based filenames."""

from __future__ import annotations

import os
import re
import time
import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

try:
    import folder_paths
except Exception:  # pragma: no cover - ComfyUI provides this at runtime.
    folder_paths = None

try:
    from comfy_execution.utils import get_executing_context
except Exception:  # pragma: no cover - older ComfyUI builds may not expose this.
    get_executing_context = None


_INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _sanitize_filename(value: str, default: str = "image") -> str:
    cleaned = _INVALID_FILENAME_CHARS.sub("_", str(value or "").strip())
    cleaned = cleaned.strip(" .")
    return cleaned or default


def _output_dir() -> Path:
    if folder_paths is not None:
        return Path(folder_paths.get_output_directory())
    return Path.cwd()


def _resolve_folder(folder_path: str) -> Path:
    raw = str(folder_path or "").strip()
    if not raw:
        return _output_dir() / "NO8D_dataset"
    path = Path(os.path.expanduser(os.path.expandvars(raw)))
    if not path.is_absolute():
        path = _output_dir() / path
    return path


def _current_list_index() -> int:
    if get_executing_context is None:
        return 0
    context = get_executing_context()
    if context is None or context.list_index is None:
        return 0
    return max(0, _safe_int(context.list_index, 0))


def _image_tensor_to_pil(image: Any) -> Image.Image:
    if hasattr(image, "detach"):
        array = image.detach().cpu().numpy()
    elif hasattr(image, "cpu"):
        array = image.cpu().numpy()
    else:
        array = np.asarray(image)

    if array.ndim == 4:
        array = array[0]
    if array.ndim != 3:
        raise ValueError(f"NO8D save: unsupported image shape {array.shape!r}")
    if array.shape[0] in (1, 3, 4) and array.shape[-1] not in (1, 3, 4):
        array = np.moveaxis(array, 0, -1)

    array = np.clip(array * 255.0, 0, 255).astype(np.uint8)
    if array.shape[-1] == 1:
        return Image.fromarray(array[:, :, 0], mode="L")
    return Image.fromarray(array)


def _iter_images(images: Any):
    if isinstance(images, (list, tuple)):
        for image in images:
            yield image
        return

    shape = getattr(images, "shape", None)
    if shape is not None and len(shape) == 4 and int(shape[0]) > 1 and not _source_stem(images):
        for image in images:
            yield image
        return

    yield images


def _source_stem(image: Any) -> str:
    for attr in ("no8d_source_stem", "no8d_source_name"):
        value = getattr(image, attr, "")
        if value:
            return Path(str(value)).stem
    return ""


def _caption_at(caption: Any, index: int) -> str:
    if isinstance(caption, (list, tuple)):
        if not caption:
            return ""
        item = caption[index] if index < len(caption) else caption[-1]
        return str(item or "")
    return str(caption or "")


_VARIABLES = ("none", "original_name", "datetime", "size_class")
_IMAGE_FORMATS = ("png", "jpg", "webp")


def _size_class(width: int, height: int) -> str:
    long_side = max(_safe_int(width, 0), _safe_int(height, 0))
    if long_side <= 0:
        return ""
    if long_side <= 1536:
        return "1k"
    if long_side <= 3072:
        return "2k"
    if long_side <= 6144:
        return "4k"
    return "8k"


def _variable_value(variable: str, *, original_name: str, width: int, height: int) -> str:
    now = time.localtime()
    variable = str(variable or "none")
    if variable == "original_name":
        return original_name
    if variable == "datetime":
        return time.strftime("%Y%m%d_%H%M%S", now)
    if variable == "size_class":
        return _size_class(width, height)
    return ""


def _join_name_parts(*parts: str) -> str:
    clean_parts = []
    for part in parts:
        text = str(part or "").strip().strip("_")
        if text:
            clean_parts.append(text)
    return _sanitize_filename("_".join(clean_parts), "image")


def _name_part(variable: str, text: str, *, original_name: str, width: int, height: int) -> str:
    variable = str(variable or "none")
    if variable != "none":
        return _variable_value(variable, original_name=original_name, width=width, height=height)
    return str(text or "")


def _parse_name_parts(name_parts_json: str):
    try:
        parts = json.loads(str(name_parts_json or "[]"))
    except json.JSONDecodeError:
        parts = []
    if not isinstance(parts, list):
        parts = []
    cleaned = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        variable = str(part.get("variable") or "none")
        if variable not in _VARIABLES:
            variable = "none"
        cleaned.append({
            "variable": variable,
            "text": str(part.get("text") or ""),
        })
    return cleaned


def _unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    counter = 1
    while True:
        candidate = parent / f"{stem}_{counter:06d}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def _save_image(path: Path, image: Image.Image, image_format: str, quality: int) -> None:
    image_format = str(image_format or "png").lower()
    if image_format not in _IMAGE_FORMATS:
        image_format = "png"
    quality = max(1, min(100, _safe_int(quality, 100)))

    if image_format == "png":
        compress_level = round((100 - quality) / 100 * 9)
        if quality < 100:
            colors = max(16, min(256, round(16 + (quality / 100) * 240)))
            quantize_method = getattr(Image, "Quantize", Image).FASTOCTREE if image.mode == "RGBA" else getattr(Image, "Quantize", Image).MEDIANCUT
            image = image.convert("RGBA" if image.mode == "RGBA" else "RGB").quantize(colors=colors, method=quantize_method)
        image.save(path, format="PNG", compress_level=compress_level)
        return

    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    if image_format == "jpg":
        image.save(path, format="JPEG", quality=quality, subsampling=0 if quality >= 95 else -1, optimize=True)
        return
    image.save(path, format="WEBP", quality=quality, method=6)


class NO8DSaveImageTextDataset:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "folder_path": ("STRING", {"default": ""}),
                "name_parts_json": ("STRING", {"default": '[{"variable":"none","text":""}]', "multiline": False}),
                "image_format": (_IMAGE_FORMATS, {"default": "png"}),
                "quality": ("INT", {"default": 100, "min": 1, "max": 100}),
            },
            "optional": {
                "caption": ("STRING", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "NO8D-control"

    def save(
        self,
        images,
        folder_path="",
        name_parts_json='[{"variable":"none","text":""}]',
        image_format="png",
        quality=100,
        caption=None,
    ):
        folder = _resolve_folder(folder_path)
        folder.mkdir(parents=True, exist_ok=True)

        image_format = str(image_format or "png").lower()
        if image_format not in _IMAGE_FORMATS:
            image_format = "png"
        name_parts = _parse_name_parts(name_parts_json)
        saved = []

        for batch_index, image in enumerate(_iter_images(images)):
            pil_image = _image_tensor_to_pil(image)
            source_name = _sanitize_filename(_source_stem(image), "")
            fallback_name = str(_current_list_index() + batch_index + 1).zfill(5)
            original_name = source_name or fallback_name
            base_name = _join_name_parts(*[
                _name_part(
                    part["variable"],
                    part["text"],
                    original_name=original_name,
                    width=pil_image.width,
                    height=pil_image.height,
                )
                for part in name_parts
            ])
            if not name_parts or base_name == "image":
                base_name = _sanitize_filename(original_name, "image")
            else:
                base_name = _sanitize_filename(base_name, "image")
            image_path = folder / f"{base_name}.{image_format}"
            text_path = folder / f"{base_name}.txt"
            has_caption = caption is not None

            if image_path.exists() or (has_caption and text_path.exists()):
                image_path = _unique_path(image_path)
                text_path = image_path.with_suffix(".txt")

            _save_image(image_path, pil_image, image_format, quality)
            if has_caption:
                text_path.write_text(_caption_at(caption, batch_index).strip() + "\n", encoding="utf-8")
            saved.append(str(image_path))

        return {"ui": {"saved": saved}, "result": ()}


NODE_CLASS_MAPPINGS = {
    "NO8DSaveImageTextDataset": NO8DSaveImageTextDataset,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NO8DSaveImageTextDataset": "NO8D save",
}
