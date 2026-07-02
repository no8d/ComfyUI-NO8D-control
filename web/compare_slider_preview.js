import { app } from "../../scripts/app.js";
import { t } from "./no8d_i18n.js";

const NODE_NAME = "NO8DABPreview";
const MIN_WIDTH = 320;
const MIN_HEIGHT = 320;
const EDGE_PAD = 10;

const legacyDomStyle = document.createElement("style");
legacyDomStyle.textContent = `
    .dom-widget.no8d-compare-fit-widget,
    .dom-widget.no8d-compare-widget {
        pointer-events: none !important;
        overflow: hidden !important;
    }
`;
document.head.appendChild(legacyDomStyle);

function isTargetNode(node) {
    const type = node?.constructor?.comfyClass || node?.comfyClass || node?.type;
    return type === NODE_NAME;
}

function imageRefs(refs) {
    return Array.isArray(refs) ? refs.filter((ref) => ref?.filename) : [];
}

function imageKey(ref) {
    return `${ref?.type || ""}/${ref?.subfolder || ""}/${ref?.filename || ""}`;
}

function makeViewUrl(ref) {
    const params = new URLSearchParams(ref || {});
    return `/view?${params.toString()}`;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function fitRect(img, rect) {
    if (!img?.naturalWidth || !img?.naturalHeight) return null;
    const [, , boxW, boxH] = rect;
    const scale = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
    const w = Math.max(1, img.naturalWidth * scale);
    const h = Math.max(1, img.naturalHeight * scale);
    return [
        rect[0] + (boxW - w) / 2,
        rect[1] + (boxH - h) / 2,
        w,
        h,
    ];
}

function drawContainedImage(ctx, img, rect) {
    const fit = fitRect(img, rect);
    if (!fit) return null;
    ctx.drawImage(img, fit[0], fit[1], fit[2], fit[3]);
    return fit;
}

function loadPreviewImage(node, slot, ref) {
    const key = ref?.filename ? imageKey(ref) : "";
    node._no8dABImages = node._no8dABImages || {};
    if (!key) {
        node._no8dABImages[slot] = null;
        return;
    }
    const existing = node._no8dABImages[slot];
    if (existing?.key === key) return;
    const img = new Image();
    img.onload = () => app.graph?.setDirtyCanvas?.(true, true);
    img.onerror = () => app.graph?.setDirtyCanvas?.(true, true);
    img.src = makeViewUrl(ref);
    node._no8dABImages[slot] = { key, ref, img };
}

function hasComparableImages(node) {
    const images = node?._no8dABImages || {};
    return Boolean(images.a?.img?.naturalWidth && images.b?.img?.naturalWidth);
}

function updateNodeSplit(node, pos) {
    const widget = node?._no8dCompareWidget;
    if (!widget || !hasComparableImages(node)) return false;
    return widget.setSplitFromPos(pos);
}

function isInImageArea(node, pos) {
    const widget = node?._no8dCompareWidget;
    const rect = widget?.rect;
    if (!rect) return false;
    const top = Math.max(0, Math.min(rect[1], (node.inputs?.length || 0) * 20 + 28));
    const bottom = rect[1] + rect[3];
    if (pos[0] < rect[0] || pos[0] > rect[0] + rect[2]) return false;
    if (pos[1] < top || pos[1] > bottom) return false;
    return true;
}

class NO8DCompareWidget {
    constructor(node) {
        this.type = "custom";
        this.name = "no8d_ab_preview";
        this.options = {};
        this.value = "";
        this.node = node;
        this.dragging = false;
        this.rect = [0, 0, MIN_WIDTH, MIN_HEIGHT];
        this.imageRect = null;
    }

    computeSize(width) {
        return [Math.max(MIN_WIDTH, width), MIN_HEIGHT];
    }

    setSplitFromPos(pos) {
        const rect = this.imageRect || this.rect;
        if (!rect?.[2]) return false;
        this.node._no8dSplit = ((pos[0] - rect[0]) / rect[2]) * 100;
        app.graph?.setDirtyCanvas?.(true, true);
        return true;
    }

    nodePosFromWidgetPos(pos) {
        if (!Array.isArray(pos)) return pos;
        return [pos[0] + this.rect[0], pos[1] + this.rect[1]];
    }

    mouse(event, pos) {
        const nodePos = this.nodePosFromWidgetPos(pos);
        if (!isInImageArea(this.node, nodePos)) return false;
        const type = String(event?.type || "");
        if (type.includes("down") && event.button === 0) {
            this.dragging = hasComparableImages(this.node);
            if (this.dragging) this.setSplitFromPos(nodePos);
            return true;
        }
        if (type.includes("move")) {
            if (!(event.buttons & 1)) {
                this.dragging = false;
                return true;
            }
            if (this.dragging && hasComparableImages(this.node)) this.setSplitFromPos(nodePos);
            return true;
        }
        if (type.includes("up") || type.includes("cancel") || type.includes("leave")) {
            this.dragging = false;
            return true;
        }
        return true;
    }

    draw(ctx, node, width, y) {
        const fullWidth = node.size?.[0] || width;
        const fullHeight = node.size?.[1] || MIN_HEIGHT;
        const rect = [
            EDGE_PAD,
            y + EDGE_PAD,
            Math.max(1, fullWidth - EDGE_PAD * 2),
            Math.max(1, fullHeight - y - EDGE_PAD * 2),
        ];
        this.rect = rect;
        this.imageRect = null;

        ctx.save();
        ctx.fillStyle = "#101010";
        ctx.fillRect(rect[0], rect[1], rect[2], rect[3]);

        const images = node._no8dABImages || {};
        const a = images.a?.img;
        const b = images.b?.img;
        const hasA = Boolean(a?.naturalWidth);
        const hasB = Boolean(b?.naturalWidth);

        if (!hasA && !hasB) {
            ctx.fillStyle = "#ddd";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(t("abNoComparableImage"), rect[0] + rect[2] / 2, rect[1] + rect[3] / 2);
            ctx.restore();
            return;
        }

        if (hasA && !hasB) {
            this.imageRect = drawContainedImage(ctx, a, rect);
            ctx.restore();
            return;
        }
        if (!hasA && hasB) {
            this.imageRect = drawContainedImage(ctx, b, rect);
            ctx.restore();
            return;
        }

        const baseRect = fitRect(a, rect) || rect;
        this.imageRect = baseRect;
        drawContainedImage(ctx, b, baseRect);

        const splitX = baseRect[0] + baseRect[2] * (node._no8dSplit ?? 50) / 100;
        const imageLeft = baseRect[0];
        const imageRight = baseRect[0] + baseRect[2];
        const clippedSplitX = clamp(splitX, imageLeft, imageRight);
        if (clippedSplitX > imageLeft) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(imageLeft, baseRect[1], clippedSplitX - imageLeft, baseRect[3]);
            ctx.clip();
            drawContainedImage(ctx, a, baseRect);
            ctx.restore();
        }

        if (splitX >= imageLeft && splitX <= imageRight) {
            ctx.strokeStyle = "rgba(255,255,255,0.6)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(splitX, baseRect[1]);
            ctx.lineTo(splitX, baseRect[1] + baseRect[3]);
            ctx.stroke();
        }
        ctx.restore();
    }
}

function installWidget(node) {
    if (node._no8dCompareWidget || typeof node.addCustomWidget !== "function") return;
    node._no8dSplit = node._no8dSplit ?? 50;
    node._no8dCompareWidget = node.addCustomWidget(new NO8DCompareWidget(node));
    node.size = node.size || [MIN_WIDTH, MIN_HEIGHT];
    node.size[0] = Math.max(node.size[0] || MIN_WIDTH, MIN_WIDTH);
    node.size[1] = Math.max(node.size[1] || MIN_HEIGHT, MIN_HEIGHT);
}

function removeLegacyDomWidgets(node) {
    if (!node) return;
    if (node._no8dCompareEls?.root) {
        node._no8dCompareEls.root.remove?.();
        node._no8dCompareEls = null;
    }
    if (!Array.isArray(node.widgets)) return;
    node.widgets = node.widgets.filter((widget) => {
        if (widget?.name !== "no8d_compare_slider") return true;
        widget.element?.remove?.();
        widget.inputEl?.remove?.();
        widget.domElement?.remove?.();
        return false;
    });
}

app.registerExtension({
    name: "NO8D.Control.ABPreview",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;
        const onResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function () {
            removeLegacyDomWidgets(this);
            onResize?.apply(this, arguments);
            app.graph?.setDirtyCanvas?.(true, true);
        };
        const onMouseDown = nodeType.prototype.onMouseDown;
        nodeType.prototype.onMouseDown = function (event, pos, canvas) {
            if (!isTargetNode(this)) return onMouseDown?.apply(this, arguments);
            if (!isInImageArea(this, pos)) return onMouseDown?.apply(this, arguments);
            if (event.button === 0 && hasComparableImages(this)) {
                this._no8dABDragging = true;
                updateNodeSplit(this, pos);
            }
            return true;
        };
        const onMouseMove = nodeType.prototype.onMouseMove;
        nodeType.prototype.onMouseMove = function (event, pos, canvas) {
            if (!isTargetNode(this)) return onMouseMove?.apply(this, arguments);
            if (!(event.buttons & 1)) {
                this._no8dABDragging = false;
                return onMouseMove?.apply(this, arguments);
            }
            if (this._no8dABDragging && hasComparableImages(this)) {
                updateNodeSplit(this, pos);
                return true;
            }
            return onMouseMove?.apply(this, arguments);
        };
        const onMouseUp = nodeType.prototype.onMouseUp;
        nodeType.prototype.onMouseUp = function (event, pos, canvas) {
            if (isTargetNode(this) && this._no8dABDragging) {
                this._no8dABDragging = false;
                return true;
            }
            return onMouseUp?.apply(this, arguments);
        };
        const onMouseLeave = nodeType.prototype.onMouseLeave;
        nodeType.prototype.onMouseLeave = function () {
            return onMouseLeave?.apply(this, arguments);
        };
    },
    async nodeCreated(node) {
        if (!isTargetNode(node)) return;
        removeLegacyDomWidgets(node);
        installWidget(node);

        const originalOnExecuted = node.onExecuted;
        node.onExecuted = function (message) {
            removeLegacyDomWidgets(this);
            originalOnExecuted?.call(this, message);
            const aRefs = imageRefs(message?.a_images);
            const bRefs = imageRefs(message?.b_images);
            loadPreviewImage(this, "a", aRefs[aRefs.length - 1]);
            loadPreviewImage(this, "b", bRefs[bRefs.length - 1]);
            app.graph?.setDirtyCanvas?.(true, true);
        };
    },
});
