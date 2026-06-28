import { app } from "../../scripts/app.js";
import { t } from "./no8d_i18n.js";

const NODE_NAME = "NO8DPromptView";

function findWidget(node, name) {
    return (node.widgets || []).find((w) => w.name === name);
}

function setWidget(widget, value) {
    if (!widget) return;
    widget.value = value;
    try {
        if (typeof widget.callback === "function") {
            widget.callback(value, app.canvas, widget.node || null);
        }
    } catch (_) {}
}

function hideInternalWidgets(node) {
    for (const widget of node.widgets || []) {
        if (widget.name !== "send_seq") continue;
        widget.value = "0";
        widget.options = widget.options || {};
        widget.options.hidden = true;
        widget.options.collapsed = true;
        widget.type = "converted-widget";
        widget.hidden = true;
        widget.computeSize = () => [0, -4];
        widget.draw = () => {};
    }
    node.graph?.setDirtyCanvas?.(true, true);
    app?.canvas?.setDirty?.(true, true);
}

function readIncomingFromMessage(message) {
    const value = message?.NO8DPromptView_text || message?.ui?.NO8DPromptView_text;
    if (Array.isArray(value)) return value[0] || "";
    if (typeof value === "string") return value;
    return "";
}

function syncNativeLabels(node) {
    node.title = t("promptViewTitle");
    const edited = findWidget(node, "edited_text");
    if (edited) {
        edited.label = t("promptEditedText");
        edited.options = edited.options || {};
        edited.options.label = t("promptEditedText");
    }
    const auto = findWidget(node, "auto_output");
    if (auto) {
        auto.label = t("promptViewAuto");
        auto.options = auto.options || {};
        auto.options.label = t("promptViewAuto");
    }
}

function collectDownstreamNodeIds(node) {
    const graph = node?.graph || app?.graph;
    const result = new Set();
    const pending = [];
    for (const output of node.outputs || []) {
        for (const linkId of output.links || []) {
            const link = graph?.links?.[linkId];
            if (link?.target_id != null) pending.push(link.target_id);
        }
    }
    while (pending.length) {
        const id = pending.shift();
        if (id == null || result.has(String(id))) continue;
        result.add(String(id));
        const next = graph?.getNodeById?.(id);
        for (const output of next?.outputs || []) {
            for (const linkId of output.links || []) {
                const link = graph?.links?.[linkId];
                if (link?.target_id != null) pending.push(link.target_id);
            }
        }
    }
    if (!result.size && node?.id != null) result.add(String(node.id));
    return [...result];
}

async function queueEditedPrompt(node, editedText, sendSeq) {
    try {
        if (typeof app.graphToPrompt !== "function" || typeof app.api?.queuePrompt !== "function") {
            throw new Error("ComfyUI queue API is unavailable");
        }
        const prompt = await app.graphToPrompt();
        const output = prompt?.output || {};
        const viewPromptNode = output[String(node.id)];
        if (!viewPromptNode?.inputs) throw new Error("Prompt view node is not present in the queued prompt");
        viewPromptNode.inputs.text = editedText || "";
        viewPromptNode.inputs.auto_output = false;
        viewPromptNode.inputs.edited_text = editedText || "";
        viewPromptNode.inputs.send_seq = String(sendSeq || "0");
        await app.api.queuePrompt(0, prompt, { partialExecutionTargets: collectDownstreamNodeIds(node) });
    } catch (error) {
        app.extensionManager?.toast?.add?.({
            severity: "warn",
            summary: t("promptViewSend"),
            detail: error?.message || String(error),
            life: 3000,
        });
    }
}

function sendEditedText(node) {
    const edited = findWidget(node, "edited_text");
    if (!edited) return;
    setWidget(findWidget(node, "auto_output"), false);
    const nextSeq = String(Date.now());
    node.graph?.setDirtyCanvas?.(true, true);
    app?.canvas?.setDirty?.(true, true);
    queueEditedPrompt(node, String(edited.value || ""), nextSeq);
}

function ensureSendWidget(node) {
    if (node._promptViewSendWidget) return;
    const existing = (node.widgets || []).find((widget) => widget._no8dPromptSend);
    if (existing) {
        node._promptViewSendWidget = existing;
        return;
    }
    const widget = node.addWidget("button", t("promptViewSend"), null, () => sendEditedText(node));
    widget._no8dPromptSend = true;
    widget.label = t("promptViewSend");
    widget.options = widget.options || {};
    widget.options.label = t("promptViewSend");
    node._promptViewSendWidget = widget;
}

function activate(node) {
    if (node?.type !== NODE_NAME && node?.comfyClass !== NODE_NAME) return;
    hideInternalWidgets(node);
    ensureSendWidget(node);
    syncNativeLabels(node);
}

function setIncomingText(node, incoming) {
    const edited = findWidget(node, "edited_text");
    if (!edited) return;
    if (!incoming && !(node.inputs || []).some((input) => input?.name === "text" && input.link != null)) return;
    if (incoming !== node._promptViewIncoming) {
        setWidget(edited, incoming || "");
        node._promptViewIncoming = incoming || "";
    }
}

app.registerExtension({
    name: "NO8D.Control.PromptView",
    async setup() {
        setTimeout(() => {
            for (const node of app?.graph?._nodes || []) activate(node);
        }, 500);
    },
    async nodeCreated(node) {
        activate(node);
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onCreated) onCreated.apply(this, arguments);
            activate(this);
        };
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            if (onConfigure) onConfigure.apply(this, arguments);
            setTimeout(() => activate(this), 0);
        };
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            if (onExecuted) onExecuted.apply(this, arguments);
            activate(this);
            setIncomingText(this, readIncomingFromMessage(message));
        };
    },
});
