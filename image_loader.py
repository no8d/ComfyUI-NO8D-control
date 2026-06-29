from __future__ import annotations

import hashlib
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


def _resolve_folder(folder_path):
    text = str(folder_path or "").strip().strip('"').strip("'")
    if not text:
        return Path(_input_directory()).resolve()
    path = Path(text).expanduser()
    if not path.is_absolute():
        path = Path(_input_directory()) / path
    return path.resolve()


def _safe_int(value, default=0):
    try:
        return int(float(value))
    except Exception:
        return default


def _iter_image_paths(folder, recursive):
    pattern = "**/*" if recursive else "*"
    files = []
    for path in folder.glob(pattern):
        if path.is_file() and path.suffix.lower() in _IMAGE_EXTENSIONS:
            files.append(path)
    return files


def _sort_paths(paths, sort_by, order):
    sort_by = str(sort_by or "name")
    reverse = str(order or "ascending") == "descending"
    if sort_by == "modified":
        return sorted(paths, key=lambda path: (path.stat().st_mtime, path.name.lower()), reverse=reverse)
    return sorted(paths, key=lambda path: str(path).lower(), reverse=reverse)


def _load_image(path):
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode == "I":
            image = image.point(lambda i: i * (1 / 255))
        image = image.convert("RGB")
        arr = np.asarray(image).astype(np.float32) / 255.0
    return torch.from_numpy(arr)[None,]


def _fingerprint(paths, folder, recursive, sort_by, order, start_index, max_images):
    h = hashlib.sha1()
    h.update(str(folder).encode("utf-8", errors="ignore"))
    h.update(str(bool(recursive)).encode())
    h.update(str(sort_by).encode())
    h.update(str(order).encode())
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
                "folder_path": ("STRING", {"default": "", "multiline": False}),
                "recursive": ("BOOLEAN", {"default": False}),
                "sort_by": (["name", "modified"], {"default": "name"}),
                "order": (["ascending", "descending"], {"default": "ascending"}),
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
    def IS_CHANGED(cls, folder_path="", recursive=False, sort_by="name", order="ascending", start_index=0, max_images=0):
        folder = _resolve_folder(folder_path)
        if not folder.is_dir():
            return f"missing:{folder}"
        paths = _sort_paths(_iter_image_paths(folder, recursive), sort_by, order)
        start = max(0, _safe_int(start_index, 0))
        limit = max(0, _safe_int(max_images, 0))
        selected = paths[start:] if limit <= 0 else paths[start:start + limit]
        return _fingerprint(selected, folder, recursive, sort_by, order, start, limit)

    def load(self, folder_path="", recursive=False, sort_by="name", order="ascending", start_index=0, max_images=0):
        folder = _resolve_folder(folder_path)
        if not folder.is_dir():
            raise FileNotFoundError(f"NO8D-Load-images: folder not found: {folder}")

        paths = _sort_paths(_iter_image_paths(folder, recursive), sort_by, order)
        start = max(0, _safe_int(start_index, 0))
        limit = max(0, _safe_int(max_images, 0))
        selected = paths[start:] if limit <= 0 else paths[start:start + limit]
        if not selected:
            raise ValueError(f"NO8D-Load-images: no images found in {folder}")

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
