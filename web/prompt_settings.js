import { app } from "../../scripts/app.js";
import { t } from "./no8d_i18n.js";

const API_PREFIX = "/no8d-control/api";
const RULES = [
    { value: "自然语言", labelKey: "kreaCaptionRule" },
    { value: "json结构", labelKey: "ideogramCaptionRule" },
];
const BUILTIN_RULES = new Set(RULES.map((rule) => rule.value));
const BUILTIN_SERVICES = new Set(["openai"]);

async function fetchJson(path, options = {}) {
    const response = await fetch(`${API_PREFIX}${path}`, options);
    const data = await response.json();
    if (!response.ok || data?.success === false) {
        throw new Error(data?.error || `Request failed: ${response.status}`);
    }
    return data;
}

function toast(severity, summary, detail = "") {
    app.extensionManager?.toast?.add?.({ severity, summary, detail, life: 3200 });
}

function cloneConfig(config) {
    return JSON.parse(JSON.stringify(config || { version: 1, current_service: "", prompt_rules: {}, prompt_rule_modes: {}, services: [] }));
}

function button(label, primary = false) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = label;
    el.style.cssText = [
        "height:34px",
        "border:1px solid var(--border-color,#444)",
        "border-radius:6px",
        `background:${primary ? "#5aa2f8" : "var(--comfy-input-bg,#181818)"}`,
        `color:${primary ? "#07111f" : "var(--fg-color,#ddd)"}`,
        "font-weight:600",
        "cursor:pointer",
        "padding:0 14px",
        "box-sizing:border-box",
    ].join(";");
    return el;
}

function field(label, value = "", type = "text") {
    const wrap = document.createElement("label");
    wrap.style.cssText = "display:flex; flex-direction:column; gap:6px; min-width:0; color:var(--fg-color,#ddd); font-size:12px;";
    const span = document.createElement("span");
    span.textContent = label;
    const input = document.createElement("input");
    input.type = type;
    input.value = value ?? "";
    input.style.cssText = [
        "height:32px",
        "border:1px solid var(--border-color,#444)",
        "border-radius:4px",
        "background:var(--comfy-input-bg,#111)",
        "color:var(--input-text,#eee)",
        "padding:4px 8px",
        "box-sizing:border-box",
        "min-width:0",
    ].join(";");
    wrap.append(span, input);
    wrap.input = input;
    return wrap;
}

function select(options, value) {
    const el = document.createElement("select");
    el.style.cssText = "height:34px; min-width:220px; border:1px solid var(--border-color,#444); border-radius:6px; background:var(--comfy-input-bg,#111); color:var(--input-text,#eee); padding:4px 10px; box-sizing:border-box;";
    for (const item of options) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label ?? t(item.labelKey);
        el.appendChild(option);
    }
    el.value = value || options[0]?.value || "";
    return el;
}

function searchableSelect(options, value, placeholder = "") {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex; flex-direction:column; gap:8px; min-width:0;";
    const search = document.createElement("input");
    search.type = "text";
    search.placeholder = placeholder || t("searchModel");
    search.style.cssText = [
        "height:32px",
        "border:1px solid var(--border-color,#444)",
        "border-radius:4px",
        "background:var(--comfy-input-bg,#111)",
        "color:var(--input-text,#eee)",
        "padding:4px 8px",
        "box-sizing:border-box",
        "min-width:0",
    ].join(";");
    const list = document.createElement("select");
    list.size = Math.min(8, Math.max(2, options.length));
    list.style.cssText = "display:none; width:100%; min-width:0; min-height:36px; max-height:210px; border:1px solid var(--border-color,#444); border-radius:6px; background:var(--comfy-input-bg,#111); color:var(--input-text,#eee); padding:4px 6px; box-sizing:border-box;";
    let selected = value || options[0] || "";
    let open = false;
    const setOpen = (value) => {
        open = value;
        list.style.display = open ? "block" : "none";
    };
    const render = () => {
        const queryText = search.value.trim();
        const query = queryText && queryText !== selected ? queryText.toLowerCase() : "";
        const filtered = options.filter((name) => String(name).toLowerCase().includes(query));
        list.replaceChildren();
        for (const name of filtered) {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            list.appendChild(option);
        }
        if (filtered.includes(selected)) {
            list.value = selected;
        } else if (filtered.length) {
            list.value = filtered[0];
        }
        setOpen(open && filtered.length > 0);
    };
    search.placeholder = selected || placeholder || t("searchModel");
    search.value = selected;
    search.addEventListener("focus", () => {
        setOpen(options.length > 0);
        render();
    });
    search.addEventListener("input", render);
    list.addEventListener("change", () => {
        selected = list.value;
        search.value = selected;
        wrap.onchange?.(selected);
        setOpen(false);
    });
    search.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (list.value) {
            selected = list.value;
            search.value = selected;
            wrap.onchange?.(selected);
            setOpen(false);
        }
    });
    search.addEventListener("blur", () => {
        window.setTimeout(() => setOpen(false), 120);
    });
    wrap.value = () => selected;
    wrap.append(search, list);
    render();
    return wrap;
}

function textarea(value = "") {
    const el = document.createElement("textarea");
    el.value = value ?? "";
    el.style.cssText = [
        "min-height:300px",
        "resize:vertical",
        "border:1px solid var(--border-color,#444)",
        "border-radius:6px",
        "background:var(--comfy-input-bg,#111)",
        "color:var(--input-text,#eee)",
        "padding:10px",
        "box-sizing:border-box",
        "font-family:monospace",
        "font-size:12px",
        "line-height:1.45",
    ].join(";");
    return el;
}

function uniqueServiceId(services, base = "custom") {
    const ids = new Set((services || []).map((service) => service.id));
    if (!ids.has(base)) return base;
    let index = 2;
    while (ids.has(`${base}_${index}`)) index += 1;
    return `${base}_${index}`;
}

const SERVICE_TYPES = [
    { value: "openai_compatible", labelKey: "openaiCompatibleService" },
    { value: "ollama", labelKey: "localLlmService" },
];

function defaultBaseUrlForType(type) {
    return type === "ollama" ? "http://localhost:11434" : "";
}

function serviceTypeLabel(type) {
    const item = SERVICE_TYPES.find((serviceType) => serviceType.value === type);
    return item ? t(item.labelKey) : t("openaiCompatibleService");
}

function labeledSelect(labelText, options, value) {
    const wrap = document.createElement("label");
    wrap.style.cssText = "display:flex; flex-direction:column; gap:6px; min-width:0; color:var(--fg-color,#ddd); font-size:12px;";
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = select(options, value);
    input.style.width = "100%";
    wrap.append(label, input);
    wrap.input = input;
    return wrap;
}

function ruleItems(config) {
    const names = [];
    for (const rule of RULES) names.push(rule.value);
    for (const name of Object.keys(config.prompt_rules || {})) {
        if (!names.includes(name)) names.push(name);
    }
    return names.map((name) => {
        const builtin = RULES.find((rule) => rule.value === name);
        return { value: name, label: builtin ? t(builtin.labelKey) : name, builtin: !!builtin };
    });
}

function ruleDisplayName(ruleName) {
    const builtin = RULES.find((rule) => rule.value === ruleName);
    return builtin ? t(builtin.labelKey) : ruleName;
}

function saveConfig(config) {
    return fetchJson("/prompt/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
    });
}

function makeModal(titleText, width = "900px") {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.55);";
    const dialog = document.createElement("div");
    dialog.style.cssText = `width:min(${width}, calc(100vw - 48px)); max-height:calc(100vh - 64px); display:grid; grid-template-rows:auto 1fr auto; background:var(--comfy-menu-bg,#181818); color:var(--fg-color,#ddd); border:1px solid var(--border-color,#444); border-radius:8px; box-shadow:0 18px 48px rgba(0,0,0,0.45); overflow:hidden;`;
    const header = document.createElement("div");
    header.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid var(--border-color,#444);";
    const title = document.createElement("div");
    title.textContent = titleText;
    title.style.cssText = "font-weight:700; font-size:16px;";
    const close = button("x");
    close.style.width = "34px";
    close.style.padding = "0";
    header.append(title, close);
    const body = document.createElement("div");
    body.style.cssText = "overflow:auto;";
    const footer = document.createElement("div");
    footer.style.cssText = "display:flex; align-items:center; justify-content:flex-end; gap:8px; padding:12px 18px; border-top:1px solid var(--border-color,#444);";
    dialog.append(header, body, footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    close.onclick = () => overlay.remove();
    return { overlay, body, footer };
}

function showRuleManager(initialConfig, onSaved) {
    const { overlay, body, footer } = makeModal(t("promptRuleManagerTitle"), "900px");
    body.style.cssText = "display:grid; grid-template-columns:260px 1fr; min-height:520px; overflow:hidden;";
    const config = cloneConfig(initialConfig);
    config.prompt_rules = config.prompt_rules || {};
    config.prompt_rule_modes = config.prompt_rule_modes || {};
    const sidebar = document.createElement("div");
    sidebar.style.cssText = "display:flex; flex-direction:column; gap:8px; padding:14px; border-right:1px solid var(--border-color,#444); overflow:auto;";
    const editor = document.createElement("div");
    editor.style.cssText = "display:flex; flex-direction:column; gap:12px; padding:16px 18px; overflow:auto;";
    body.append(sidebar, editor);
    let active = RULES[0].value;
    let currentArea = null;

    function syncActiveText() {
        if (!currentArea) return;
        config.prompt_rules[active] = currentArea.value;
    }

    function uniqueRuleName(base = t("customRuleName")) {
        let name = base;
        let index = 2;
        while (Object.prototype.hasOwnProperty.call(config.prompt_rules, name)) {
            name = `${base} ${index}`;
            index += 1;
        }
        return name;
    }

    function render() {
        sidebar.replaceChildren();
        editor.replaceChildren();
        const items = ruleItems(config);
        if (!items.some((item) => item.value === active)) active = items[0]?.value || RULES[0].value;
        for (const rule of items) {
            const item = document.createElement("div");
            item.style.cssText = [
                "position:relative",
                "min-height:50px",
                "display:flex",
                "align-items:center",
                "padding:0 38px 0 14px",
                "border:1px solid var(--border-color,#444)",
                "border-radius:6px",
                `background:${rule.value === active ? "#3b82f6" : "var(--comfy-input-bg,#222)"}`,
                "color:var(--fg-color,#ddd)",
                "font-weight:700",
                "cursor:pointer",
                "box-sizing:border-box",
            ].join(";");
            item.textContent = rule.label;
            item.onclick = () => {
                syncActiveText();
                active = rule.value;
                render();
            };
            if (!rule.builtin) {
                const close = button("x");
                close.style.cssText += ";position:absolute; right:8px; top:8px; width:24px; height:24px; padding:0;";
                close.onclick = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    delete config.prompt_rules[rule.value];
                    delete config.prompt_rule_modes[rule.value];
                    if (active === rule.value) active = RULES[0].value;
                    render();
                };
                item.appendChild(close);
            }
            sidebar.appendChild(item);
        }
        const add = button(t("addRule"));
        add.style.marginTop = "auto";
        add.onclick = () => {
            syncActiveText();
            const name = uniqueRuleName();
            config.prompt_rules[name] = "";
            config.prompt_rule_modes[name] = "natural";
            active = name;
            render();
        };
        sidebar.appendChild(add);

        const activeItem = ruleItems(config).find((item) => item.value === active);
        const meta = document.createElement("div");
        meta.style.cssText = "display:grid; grid-template-columns:minmax(0, 1fr) minmax(140px, 180px); gap:10px; align-items:end; min-width:0;";
        const nameField = field(t("ruleName"), ruleDisplayName(active));
        nameField.input.disabled = !!activeItem?.builtin;
        const modeSelect = select([
            { value: "natural", label: t("ruleModeNatural") },
            { value: "json", label: t("ruleModeJson") },
        ], config.prompt_rule_modes?.[active] || "natural");
        modeSelect.style.minWidth = "0";
        modeSelect.style.width = "100%";
        const modeWrap = document.createElement("label");
        modeWrap.style.cssText = "display:flex; flex-direction:column; gap:6px; min-width:0; max-width:100%; color:var(--fg-color,#ddd); font-size:12px;";
        const modeLabel = document.createElement("span");
        modeLabel.textContent = t("ruleMode");
        modeWrap.append(modeLabel, modeSelect);
        meta.append(nameField, modeWrap);
        editor.appendChild(meta);

        const hint = document.createElement("div");
        hint.textContent = t("ruleManagerHint");
        hint.style.cssText = "color:var(--descrip-text,#aaa); font-size:12px;";
        const area = textarea(config.prompt_rules?.[active] || "");
        currentArea = area;
        area.onchange = () => {
            config.prompt_rules = config.prompt_rules || {};
            config.prompt_rules[active] = area.value;
        };
        editor.append(hint, area);

        nameField.input.onchange = () => {
            const nextName = nameField.input.value.trim();
            if (!nextName || nextName === active) return;
            if (Object.prototype.hasOwnProperty.call(config.prompt_rules, nextName)) {
                toast("error", t("duplicateRuleName"));
                nameField.input.value = active;
                return;
            }
            syncActiveText();
            config.prompt_rules[nextName] = config.prompt_rules[active] || "";
            config.prompt_rule_modes[nextName] = config.prompt_rule_modes[active] || "natural";
            delete config.prompt_rules[active];
            delete config.prompt_rule_modes[active];
            active = nextName;
            render();
        };
        modeSelect.onchange = () => {
            config.prompt_rule_modes[active] = modeSelect.value;
        };
    }

    const cancel = button(t("cancel"));
    const save = button(t("save"), true);
    cancel.onclick = () => overlay.remove();
    save.onclick = async () => {
        try {
            if (currentArea) {
                config.prompt_rules = config.prompt_rules || {};
                config.prompt_rules[active] = currentArea.value;
            }
            await saveConfig(config);
            const next = await fetchJson("/prompt/config");
            overlay.remove();
            onSaved?.(next);
            toast("success", t("promptRulesSaved"));
        } catch (error) {
            toast("error", t("saveFailed"), error.message);
        }
    };
    footer.append(cancel, save);
    render();
}

function normalizeModels(service) {
    service.models = (service.models || []).filter((model) => model.name);
    if (service.models.length > 1) {
        const selected = service.models.find((model) => model.is_default) || service.models[0];
        service.models = [{ name: selected.name, is_default: true }];
    } else if (service.models.length) {
        service.models[0].is_default = true;
    }
}

function setSelectedModel(service, name) {
    const clean = String(name || "").trim();
    service.models = clean ? [{ name: clean, is_default: true }] : [];
    normalizeModels(service);
}

function showApiManager(initialConfig, onSaved) {
    const { overlay, body, footer } = makeModal(t("promptApiManagerTitle"), "1040px");
    body.style.cssText = "display:grid; grid-template-columns:240px 1fr; min-height:520px; overflow:hidden;";
    const sidebar = document.createElement("div");
    sidebar.style.cssText = "display:flex; flex-direction:column; gap:8px; padding:14px; border-right:1px solid var(--border-color,#444); overflow:auto;";
    const editor = document.createElement("div");
    editor.style.cssText = "display:flex; flex-direction:column; gap:14px; padding:16px 18px; overflow:auto;";
    body.append(sidebar, editor);

    const state = {
        config: cloneConfig(initialConfig),
        selectedId: initialConfig.current_service || initialConfig.services?.[0]?.id || "",
        syncCurrent: null,
        modelLists: {},
        selectTimer: null,
    };

    function selectedService() {
        return state.config.services.find((service) => service.id === state.selectedId) || state.config.services[0];
    }

    function render() {
        sidebar.replaceChildren();
        editor.replaceChildren();
        for (const service of state.config.services) {
            const item = button(service.name || service.id);
            const label = document.createElement("span");
            label.textContent = service.name || service.id;
            label.style.cssText = "display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
            item.replaceChildren(label);
            item.style.height = "50px";
            item.style.textAlign = "left";
            item.style.position = "relative";
            item.style.paddingRight = "38px";
            item.style.background = service.id === state.selectedId ? "#3b82f6" : "var(--comfy-input-bg,#222)";
            item.title = serviceTypeLabel(service.type || "openai_compatible");
            item.onclick = (event) => {
                if (event.detail > 1) return;
                window.clearTimeout(state.selectTimer);
                state.selectTimer = window.setTimeout(() => {
                    if (state.selectedId !== service.id) {
                        state.selectedId = service.id;
                        render();
                    }
                }, 180);
            };
            item.ondblclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                window.clearTimeout(state.selectTimer);
                const input = document.createElement("input");
                input.value = service.name || service.id;
                input.style.cssText = [
                    "width:100%",
                    "height:30px",
                    "box-sizing:border-box",
                    "border:1px solid var(--border-color,#444)",
                    "border-radius:4px",
                    "background:var(--comfy-input-bg,#111)",
                    "color:var(--input-text,#eee)",
                    "padding:0 8px",
                    "font:inherit",
                ].join(";");
                let committed = false;
                function commitRename() {
                    if (committed) return;
                    committed = true;
                    const nextName = input.value.trim();
                    if (nextName) service.name = nextName;
                    render();
                }
                input.onkeydown = (keyEvent) => {
                    if (keyEvent.key === "Enter") commitRename();
                    if (keyEvent.key === "Escape") {
                        committed = true;
                        render();
                    }
                };
                input.onblur = commitRename;
                item.replaceChildren(input);
                input.focus();
                input.select();
            };
            if (!BUILTIN_SERVICES.has(service.id)) {
                const removeService = button("x");
                removeService.style.cssText += ";position:absolute; right:8px; top:8px; width:24px; height:24px; padding:0;";
                removeService.onclick = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    state.config.services = state.config.services.filter((itemService) => itemService !== service);
                    state.selectedId = state.config.services[0]?.id || "";
                    state.config.current_service = state.selectedId;
                    render();
                };
                item.appendChild(removeService);
            }
            sidebar.appendChild(item);
        }
        const add = button(t("addService"));
        add.style.marginTop = "auto";
        add.onclick = () => {
            const id = uniqueServiceId(state.config.services);
            state.config.services.push({
                id,
                name: t("newServiceName"),
                type: "openai_compatible",
                base_url: "",
                api_key: "",
                models: [],
                model_options: [],
            });
            state.selectedId = id;
            state.config.current_service = id;
            render();
        };
        sidebar.appendChild(add);

        const service = selectedService();
        if (!service) {
            const empty = document.createElement("div");
            empty.textContent = t("noApiServiceConfigured");
            empty.style.cssText = "color:var(--descrip-text,#aaa);";
            editor.appendChild(empty);
            return;
        }

        service.type = service.type || "openai_compatible";
        const typeWrap = labeledSelect(
            t("serviceType"),
            SERVICE_TYPES.map((item) => ({ value: item.value, label: t(item.labelKey) })),
            service.type,
        );
        const baseUrl = field(t("baseUrl"), service.base_url || defaultBaseUrlForType(service.type));
        const row = document.createElement("div");
        row.style.cssText = "display:grid; grid-template-columns:minmax(180px, 240px); gap:18px; align-items:end;";
        row.append(typeWrap);
        editor.appendChild(row);

        const apiKey = field(t("apiKey"), "", "password");
        apiKey.input.placeholder = service.api_key_masked || (service.api_key_exists ? t("savedApiKey") : t("pasteApiKey"));
        const testApi = button(t("validateApi"), true);
        const apiKeyRow = document.createElement("div");
        apiKeyRow.style.cssText = "display:grid; grid-template-columns:minmax(220px, 1fr) minmax(220px, 1fr) auto; gap:18px; align-items:end;";
        testApi.style.minWidth = "96px";
        apiKeyRow.append(baseUrl, apiKey, testApi);
        editor.appendChild(apiKeyRow);

        function syncTypeUi() {
            const isLocal = typeWrap.input.value === "ollama";
            if (isLocal && !baseUrl.input.value.trim()) baseUrl.input.value = defaultBaseUrlForType("ollama");
            apiKey.input.disabled = isLocal;
            apiKey.input.placeholder = isLocal ? t("notRequired") : (service.api_key_masked || (service.api_key_exists ? t("savedApiKey") : t("pasteApiKey")));
        }

        const modelTitle = document.createElement("div");
        modelTitle.textContent = t("models");
        modelTitle.style.cssText = "font-weight:700;";
        const modelList = document.createElement("div");
        modelList.style.cssText = "display:flex; flex-direction:column; gap:8px; min-height:48px; padding:10px; border:1px solid var(--border-color,#444); border-radius:6px; background:rgba(255,255,255,0.035);";
        editor.append(modelTitle, modelList);

        function syncBase() {
            service.type = typeWrap.input.value || "openai_compatible";
            service.base_url = baseUrl.input.value.trim() || defaultBaseUrlForType(service.type);
            service.api_key = service.type === "ollama" ? "" : apiKey.input.value.trim();
        }
        state.syncCurrent = syncBase;

        function renderModels() {
            modelList.replaceChildren();
            normalizeModels(service);
            const selectedName = service.models?.[0]?.name || "";
            const fetched = state.modelLists[service.id] || [];
            const saved = service.model_options || [];
            const options = fetched.length ? fetched : (saved.length ? saved : (selectedName ? [selectedName] : []));
            if (!options.length) {
                const empty = document.createElement("div");
                empty.textContent = t("noModelsConfigured");
                empty.style.cssText = "color:var(--descrip-text,#aaa);";
                modelList.appendChild(empty);
                return;
            }
            if (!selectedName && options[0]) setSelectedModel(service, options[0]);
            const modelSelect = searchableSelect(options, selectedName || options[0], t("searchModel"));
            modelSelect.onchange = (value) => setSelectedModel(service, value);
            modelList.appendChild(modelSelect);
        }

        typeWrap.input.addEventListener("change", () => {
            syncTypeUi();
            syncBase();
        });
        for (const input of [baseUrl.input, apiKey.input]) {
            input.addEventListener("change", syncBase);
        }
        testApi.onclick = async () => {
            try {
                syncBase();
                const result = await fetchJson("/prompt/services/test", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ service }),
                });
                toast("success", t("apiValidated"), result.message || "");
                state.modelLists[service.id] = result.models || [];
                service.model_options = state.modelLists[service.id];
                const currentName = service.models?.[0]?.name || "";
                if ((!currentName || !state.modelLists[service.id].includes(currentName)) && state.modelLists[service.id][0]) {
                    setSelectedModel(service, state.modelLists[service.id][0]);
                }
                renderModels();
            } catch (error) {
                toast("error", t("apiValidationFailed"), error.message);
            }
        };

        syncTypeUi();
        renderModels();
    }

    const cancel = button(t("cancel"));
    const save = button(t("save"), true);
    cancel.onclick = () => overlay.remove();
    save.onclick = async () => {
        try {
            state.syncCurrent?.();
            state.config.current_service = state.selectedId || state.config.current_service;
            await saveConfig(state.config);
            const next = await fetchJson("/prompt/config");
            overlay.remove();
            onSaved?.(next);
            toast("success", t("promptApiSaved"));
        } catch (error) {
            toast("error", t("saveFailed"), error.message);
        }
    };
    footer.append(cancel, save);
    render();
}

function makeSettingsPanel() {
    const root = document.createElement("div");
    root.style.cssText = "width:min(860px, 100%); display:flex; flex-direction:column; gap:16px; padding:12px 0; box-sizing:border-box;";
    const state = { config: { version: 1, current_service: "", prompt_rules: {}, services: [] } };
    const status = document.createElement("div");
    status.textContent = t("loading");
    status.style.cssText = "color:var(--descrip-text,#aaa); font-size:12px;";
    root.appendChild(status);

    function row(labelText, control) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:grid; grid-template-columns:minmax(260px, 1fr) 260px; gap:20px; align-items:center;";
        const label = document.createElement("div");
        label.textContent = labelText;
        label.style.cssText = "color:var(--descrip-text,#aaa); font-size:14px;";
        const right = document.createElement("div");
        control.style.width = "100%";
        right.appendChild(control);
        wrap.append(label, right);
        return wrap;
    }

    function render() {
        root.replaceChildren();
        const config = state.config;
        const ruleManager = button(t("ruleManager"), true);
        const serviceOptions = (config.services || []).map((service) => ({ value: service.id, label: service.name || service.id }));
        const serviceSelect = select(serviceOptions.length ? serviceOptions : [{ value: "", label: t("noApiService") }], config.current_service);
        const apiManager = button(t("apiManager"), true);

        ruleManager.onclick = () => showRuleManager(config, (next) => {
            state.config = cloneConfig(next);
            render();
        });
        serviceSelect.onchange = async () => {
            try {
                config.current_service = serviceSelect.value;
                await saveConfig(config);
                toast("success", t("defaultApiSaved"));
            } catch (error) {
                toast("error", t("saveFailed"), error.message);
            }
        };
        apiManager.onclick = () => showApiManager(config, (next) => {
            state.config = cloneConfig(next);
            render();
        });

        const title = document.createElement("div");
        title.textContent = t("promptSettingsTitle");
        title.style.cssText = "font-weight:700; font-size:15px; color:var(--fg-color,#ddd);";
        root.append(
            title,
            row(t("promptWritingRules"), ruleManager),
            row(t("defaultPromptApi"), serviceSelect),
            row(t("promptApiConfiguration"), apiManager),
        );
    }

    fetchJson("/prompt/config")
        .then((config) => {
            state.config = cloneConfig(config);
            render();
        })
        .catch((error) => {
            status.textContent = `${t("promptConfigLoadFailed")}: ${error.message}`;
            status.style.color = "#fecaca";
        });

    return root;
}

app.registerExtension({
    name: "NO8D.Control.PromptSettings",
    settings: [
        {
            id: "NO8D.Control.Prompt",
            name: "Prompt",
            category: ["NO8D-control", "Prompt"],
            type: () => {
                const row = document.createElement("tr");
                const label = document.createElement("td");
                label.className = "comfy-menu-label";
                const cell = document.createElement("td");
                cell.appendChild(makeSettingsPanel());
                row.append(label, cell);
                return row;
            },
        },
    ],
});
