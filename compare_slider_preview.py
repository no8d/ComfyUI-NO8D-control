import nodes as comfy_nodes


class NO8DABPreview:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "image_a": ("IMAGE",),
                "image_b": ("IMAGE",),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "preview"
    OUTPUT_NODE = True
    CATEGORY = "NO8D-control"

    def preview(self, image_a=None, image_b=None, prompt=None, extra_pnginfo=None):
        saver = comfy_nodes.PreviewImage()
        result = {"a_images": [], "b_images": []}
        if image_a is not None:
            a_ui = saver.save_images(
                image_a,
                filename_prefix="NO8DABPreview_A",
            )
            result["a_images"] = a_ui["ui"]["images"]
        if image_b is not None:
            b_ui = saver.save_images(
                image_b,
                filename_prefix="NO8DABPreview_B",
            )
            result["b_images"] = b_ui["ui"]["images"]
        return {"ui": result}


NODE_CLASS_MAPPINGS = {"NO8DABPreview": NO8DABPreview}
NODE_DISPLAY_NAME_MAPPINGS = {"NO8DABPreview": "NO8D-A/B preview"}
