from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps

try:
    import folder_paths
except Exception:
    folder_paths = None


_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def _input_directory():
    if folder_paths is not None:
        try:
            return folder_paths.get_input_directory()
        except Exception:
            pass
    return os.getcwd()


def _safe_int(value, default=0):
    try:
        return int(float(value))
    except Exception:
        return default


def _base_directory(image_type):
    if folder_paths is not None:
        getters = {
            "input": "get_input_directory",
            "output": "get_output_directory",
            "temp": "get_temp_directory",
        }
        getter = getattr(folder_paths, getters.get(str(image_type or "input"), "get_input_directory"), None)
        if getter is not None:
            try:
                return Path(getter()).resolve()
            except Exception:
                pass
    return Path(_input_directory()).resolve()


def _parse_image_refs(image_files):
    if isinstance(image_files, list):
        refs = image_files
    else:
        text = str(image_files or "").strip()
        if not text:
            return []
        try:
            refs = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError("NO8D-Load-images: image list is not valid JSON.") from exc
    if not isinstance(refs, list):
        raise ValueError("NO8D-Load-images: image list must be a JSON array.")
    return refs


def _ref_to_path(ref):
    if isinstance(ref, str):
        text = ref.strip()
        path = Path(text).expanduser()
        if not path.is_absolute():
            path = _base_directory("input") / path
        return path.resolve()

    if not isinstance(ref, dict):
        raise ValueError("NO8D-Load-images: each image reference must be a string or an object.")

    name = str(ref.get("name") or "").strip()
    if not name:
        raise ValueError("NO8D-Load-images: image reference missing name.")
    subfolder = str(ref.get("subfolder") or "").strip().strip("/\\")
    image_type = str(ref.get("type") or "input").strip() or "input"
    path = _base_directory(image_type)
    if subfolder:
        path = path / subfolder
    return (path / name).resolve()


def _load_image(path):
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode == "I":
            image = image.point(lambda i: i * (1 / 255))
        image = image.convert("RGB")
        arr = np.asarray(image).astype(np.float32) / 255.0
    return torch.from_numpy(arr)[None,]


def _fingerprint(paths, image_files, start_index, max_images):
    h = hashlib.sha1()
    h.update(str(image_files or "").encode("utf-8", errors="ignore"))
    h.update(str(start_index).encode())
    h.update(str(max_images).encode())
    for path in paths:
        try:
            stat = path.stat()
            h.update(str(path).encode("utf-8", errors="ignore"))
            h.update(str(stat.st_size).encode())
            h.update(str(stat.st_mtime_ns).encode())
        except OSError:
            h.update(str(path).encode("utf-8", errors="ignore"))
    return h.hexdigest()


class NO8DLoadImages:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_files": ("STRING", {"default": "[]", "multiline": False}),
                "start_index": ("INT", {"default": 0, "min": 0, "max": 1000000, "step": 1}),
                "max_images": ("INT", {"default": 0, "min": 0, "max": 1000000, "step": 1}),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING", "INT")
    RETURN_NAMES = ("images", "paths", "filenames", "count")
    OUTPUT_IS_LIST = (True, True, True, False)
    FUNCTION = "load"
    CATEGORY = "NO8D-control"

    @classmethod
    def IS_CHANGED(cls, image_files="[]", start_index=0, max_images=0):
        refs = _parse_image_refs(image_files)
        paths = [_ref_to_path(ref) for ref in refs]
        start = max(0, _safe_int(start_index, 0))
        limit = max(0, _safe_int(max_images, 0))
        selected = paths[start:] if limit <= 0 else paths[start:start + limit]
        return _fingerprint(selected, image_files, start, limit)

    def load(self, image_files="[]", start_index=0, max_images=0):
        refs = _parse_image_refs(image_files)
        paths = [_ref_to_path(ref) for ref in refs]
        start = max(0, _safe_int(start_index, 0))
        limit = max(0, _safe_int(max_images, 0))
        selected = paths[start:] if limit <= 0 else paths[start:start + limit]
        if not selected:
            raise ValueError("NO8D-Load-images: no images selected.")

        missing = [str(path) for path in selected if not path.is_file()]
        if missing:
            raise FileNotFoundError("NO8D-Load-images: image not found: " + missing[0])

        images = [_load_image(path) for path in selected]
        path_texts = [str(path) for path in selected]
        filenames = [path.name for path in selected]
        return (images, path_texts, filenames, len(images))


NODE_CLASS_MAPPINGS = {
    "NO8DLoadImages": NO8DLoadImages,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NO8DLoadImages": "NO8D-Load-images",
}
