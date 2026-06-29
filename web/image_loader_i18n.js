import { app } from "../../scripts/app.js";
import { no8dLocale, t } from "./no8d_i18n.js";

const NODE_CLASS = "NO8DLoadImages";
const WIDGET_LABELS = {
    folder_path: "imageLoaderFolder",
    recursive: "imageLoaderRecursive",
    sort_by: "imageLoaderSortBy",
    order: "imageLoaderOrder",
    start_index: "imageLoaderStartIndex",
    max_images: "imageLoaderMaxImages",
};
const SLOT_LABELS = {
    images: "imageLoaderImages",
    paths: "imageLoaderPaths",
    filenames: "imageLoaderFilenames",
    count: "imageLoaderCount",
};
let activeLocale = "";

function nodeClass(node) {
    return node?.comfyClass || node?.type || "";
}

function applySlotLabels(slots) {
    for (const slot of slots || []) {
        const key = SLOT_LABELS[slot.name];
        if (!key) continue;
        const label = t(key);
        slot.label = label;
        slot.localized_name = label;
    }
}

function applyLabels(node) {
    if (nodeClass(node) !== NODE_CLASS) return;
    node.title = t("imageLoaderTitle");
    for (const widget of node.widgets || []) {
        const key = WIDGET_LABELS[widget.name];
        if (!key) continue;
        const label = t(key);
        widget.label = label;
        widget.options = widget.options || {};
        widget.options.label = label;
    }
    applySlotLabels(node.inputs);
    applySlotLabels(node.outputs);
    node.graph?.setDirtyCanvas?.(true, true);
    app?.canvas?.setDirty?.(true, true);
}

function applyAllLabels() {
    for (const node of app?.graph?._nodes || []) applyLabels(node);
}

function applyAllLabelsIfNeeded(force = false) {
    const locale = no8dLocale();
    if (!force && locale === activeLocale) return;
    activeLocale = locale;
    applyAllLabels();
}

app.registerExtension({
    name: "NO8D.Control.ImageLoaderI18N",
    async setup() {
        activeLocale = no8dLocale();
        setTimeout(() => applyAllLabelsIfNeeded(true), 500);
        setTimeout(() => applyAllLabelsIfNeeded(true), 1500);
        window.addEventListener("storage", () => applyAllLabelsIfNeeded(true));
        window.addEventListener("languagechange", () => applyAllLabelsIfNeeded(true));
        setInterval(applyAllLabelsIfNeeded, 1000);
    },
    async nodeCreated(node) {
        applyLabels(node);
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onCreated) onCreated.apply(this, arguments);
            applyLabels(this);
        };
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            if (onConfigure) onConfigure.apply(this, arguments);
            setTimeout(() => applyLabels(this), 0);
        };
    },
});
