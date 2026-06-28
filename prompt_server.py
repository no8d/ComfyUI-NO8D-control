from __future__ import annotations

import json
import urllib.error
import urllib.request

try:
    from aiohttp import web
    from server import PromptServer
except Exception:
    web = None
    PromptServer = None

from .prompt_config import DEFAULT_PROMPT_RULES, PROMPT_RULE_MODES, prompt_config_manager


def _clean_key(value):
    return str(value or "").strip().strip('"').strip("'").replace("\n", "").replace("\r", "").replace("\t", "")


def _models_endpoint_from_base_url(base_url):
    url = str(base_url or "").strip().strip('"').strip("'").rstrip("/")
    if not url:
        return ""
    for suffix in ("/chat/completions", "/completions", "/models"):
        if url.endswith(suffix):
            url = url[: -len(suffix)].rstrip("/")
            break
    if "api.openai.com" in url and "/v1" not in url:
        url = url + "/v1"
    return url + "/models"


def _service_with_saved_key(service):
    service = dict(service or {})
    old = prompt_config_manager.load_config()
    old_services = {item.get("id"): item for item in old.get("services", []) if item.get("id")}
    old_service = old_services.get(service.get("id"))
    if old_service and not service.get("api_key"):
        service["api_key"] = old_service.get("api_key", "")
    return service


def _fetch_model_names(service):
    service = _service_with_saved_key(service)
    endpoint = _models_endpoint_from_base_url(service.get("base_url"))
    if not endpoint:
        raise ValueError("Base URL is empty")
    headers = {"Accept": "application/json"}
    api_key = _clean_key(service.get("api_key"))
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(endpoint, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {body[:500]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Request failed: {exc.reason}") from exc

    parsed = json.loads(raw)
    items = parsed.get("data") if isinstance(parsed, dict) else parsed
    if not isinstance(items, list):
        raise RuntimeError("API did not return a model list")
    names = []
    for item in items:
        if isinstance(item, dict):
            name = item.get("id") or item.get("name") or item.get("model")
        else:
            name = str(item)
        name = str(name or "").strip()
        if name and name not in names:
            names.append(name)
    names.sort(key=str.lower)
    return names


if PromptServer is not None and web is not None:
    API_PREFIX = "/no8d-control/api"

    @PromptServer.instance.routes.get(f"{API_PREFIX}/prompt/config")
    async def get_prompt_config(request):
        return web.json_response(prompt_config_manager.masked_config())

    @PromptServer.instance.routes.post(f"{API_PREFIX}/prompt/config")
    async def save_prompt_config(request):
        try:
            data = await request.json()
            if not isinstance(data, dict):
                return web.json_response({"success": False, "error": "Config must be an object"}, status=400)
            old_config = prompt_config_manager.load_config()
            old_services = {
                service.get("id"): service
                for service in old_config.get("services", [])
                if service.get("id")
            }
            seen_ids = set()
            for service in data.get("services", []):
                service.pop("api_key_masked", None)
                service.pop("api_key_exists", None)
                service_id = service.get("id")
                if not service_id:
                    return web.json_response({"success": False, "error": "Service ID is required"}, status=400)
                if service_id in seen_ids:
                    return web.json_response({"success": False, "error": f"Duplicate service ID: {service_id}"}, status=400)
                seen_ids.add(service_id)
                old_service = old_services.get(service.get("id"))
                if old_service and not service.get("api_key"):
                    service["api_key"] = old_service.get("api_key", "")
            data, _ = prompt_config_manager.normalize_config(data)
            if not data.get("current_service") and data["services"]:
                data["current_service"] = data["services"][0].get("id", "")
            prompt_config_manager.save_config(data)
            return web.json_response({"success": True})
        except Exception as exc:
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @PromptServer.instance.routes.post(f"{API_PREFIX}/prompt/services/current")
    async def set_current_prompt_service(request):
        try:
            data = await request.json()
            prompt_config_manager.set_current_service(data.get("service_id"))
            return web.json_response({"success": True})
        except Exception as exc:
            return web.json_response({"success": False, "error": str(exc)}, status=400)

    @PromptServer.instance.routes.post(f"{API_PREFIX}/prompt/services/models")
    async def get_prompt_service_models(request):
        try:
            data = await request.json()
            service = data.get("service") if isinstance(data, dict) else None
            models = _fetch_model_names(service)
            return web.json_response({"success": True, "models": models})
        except Exception as exc:
            return web.json_response({"success": False, "error": str(exc)}, status=400)

    @PromptServer.instance.routes.post(f"{API_PREFIX}/prompt/services/test")
    async def test_prompt_service(request):
        try:
            data = await request.json()
            service = data.get("service") if isinstance(data, dict) else None
            models = _fetch_model_names(service)
            return web.json_response({
                "success": True,
                "message": f"API validated. Found {len(models)} model(s).",
                "models": models,
            })
        except Exception as exc:
            return web.json_response({"success": False, "error": str(exc)}, status=400)
