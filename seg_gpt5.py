import argparse
import time
import cv2
import numpy as np
from skimage import segmentation, color, morphology, measure, util
from skimage import graph
import svgwrite
import os
from sklearn.cluster import KMeans

# -------------------
# parameters
# -------------------
img_path = "flx_website.png"        # input image
out_dir  = "layers_out"
n_segments = 1200                   # SLIC superpixels (increase for more detail)
compactness = 12.0                  # higher -> smoother, more compact superpixels
lab_merge_thresh = 20.0             # LAB distance threshold for merging regions (lower -> fewer merges)
min_area_fraction = 0.0015          # drop or merge shapes smaller than this fraction
simplify_tol = 1.5                  # Douglas–Peucker tolerance (pixels) for SVG paths
display_max = 1100                  # max window size for interactive UI
auto_export_individual = False      # if True, save every region automatically (masks + layers)

os.makedirs(out_dir, exist_ok=True)

# -------------------
# CLI overrides
# -------------------
_parser = argparse.ArgumentParser(add_help=False)
_parser.add_argument("--img", dest="_img_path", default=img_path)
_parser.add_argument("--out", dest="_out_dir", default=out_dir)
_parser.add_argument("--n-segments", dest="_n_segments", type=int, default=n_segments)
_parser.add_argument("--compactness", dest="_compactness", type=float, default=compactness)
_parser.add_argument("--thresh", dest="_thresh", type=float, default=lab_merge_thresh)
_parser.add_argument("--min-area-frac", dest="_min_area_frac", type=float, default=min_area_fraction)
_parser.add_argument("--display-max", dest="_display_max", type=int, default=display_max)
_parser.add_argument("--simplify", dest="_simplify", type=float, default=simplify_tol)
_parser.add_argument("--auto-export", dest="_auto_export", action="store_true")
try:
    _args, _ = _parser.parse_known_args()
    img_path = _args._img_path
    out_dir = _args._out_dir
    n_segments = _args._n_segments
    compactness = _args._compactness
    lab_merge_thresh = _args._thresh
    min_area_fraction = _args._min_area_frac
    display_max = _args._display_max
    simplify_tol = _args._simplify
    auto_export_individual = _args._auto_export
    os.makedirs(out_dir, exist_ok=True)
except SystemExit:
    # In environments that pre-parse args, ignore
    pass

# -------------------
# load + preprocess
# -------------------
bgr = cv2.imread(img_path, cv2.IMREAD_COLOR)
if bgr is None:
    raise FileNotFoundError(img_path)
rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

# edge-preserving smoothing
rgb_blur = cv2.bilateralFilter(rgb, d=7, sigmaColor=25, sigmaSpace=25)

# work in Lab for color distances
lab = cv2.cvtColor(rgb_blur, cv2.COLOR_RGB2LAB)

# -------------------
# superpixels
# -------------------
labels_slic = segmentation.slic(rgb_blur, n_segments=n_segments, compactness=compactness, start_label=0)
labels_slic = util.img_as_int(labels_slic)

# -------------------
# build RAG + merge by mean color
# -------------------
rag = graph.rag_mean_color(lab, labels_slic, mode='distance')  # use LAB color distances for merging
labels_merged = graph.cut_threshold(labels_slic, rag, thresh=lab_merge_thresh, in_place=False)

# -------------------
# remove tiny regions (merge into neighbor with closest color)
# -------------------
def _adjacency_pairs(labels_seq: np.ndarray):
    pairs = set()
    L = labels_seq
    a, b = L[:, :-1], L[:, 1:]
    m = a != b
    if m.any():
        aa = a[m].ravel(); bb = b[m].ravel()
        lo = np.minimum(aa, bb); hi = np.maximum(aa, bb)
        pairs.update(zip(lo.tolist(), hi.tolist()))
    a, b = L[:-1, :], L[1:, :]
    m = a != b
    if m.any():
        aa = a[m].ravel(); bb = b[m].ravel()
        lo = np.minimum(aa, bb); hi = np.maximum(aa, bb)
        pairs.update(zip(lo.tolist(), hi.tolist()))
    return pairs


def merge_tiny_regions_fast(labels: np.ndarray, lab_image: np.ndarray, min_pixels: int) -> np.ndarray:
    """Merge labels smaller than min_pixels into adjacent region with closest Lab mean."""
    out, _, _ = segmentation.relabel_sequential(labels)
    n = int(out.max()) + 1 if out.size else 0
    if n <= 1:
        return out

    area = np.bincount(out.ravel(), minlength=n).astype(np.int64)
    sums = np.zeros((n, 3), dtype=np.float64)
    for ch in range(3):
        np.add.at(sums[:, ch], out.ravel(), lab_image[..., ch].astype(np.float64).ravel())
    means = sums / np.maximum(area[:, None], 1)

    adj_pairs = _adjacency_pairs(out)
    neighbors = [[] for _ in range(n)]
    for a, b in adj_pairs:
        neighbors[a].append(b)
        neighbors[b].append(a)

    small = np.where(area < min_pixels)[0]
    if small.size == 0:
        return out

    parent = np.arange(n, dtype=np.int32)

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for s in small:
        nbrs = neighbors[s]
        if not nbrs:
            continue
        s_mean = means[s]
        best = None; best_d = 1e12
        for nb in nbrs:
            d = float(np.linalg.norm(s_mean - means[nb]))
            if d < best_d:
                best_d = d; best = nb
        if best is not None:
            parent[s] = find(best)

    map_ids = np.arange(n, dtype=np.int32)
    for i in range(n):
        # path compression
        j = i
        while parent[j] != j:
            parent[j] = parent[parent[j]]
            j = parent[j]
        map_ids[i] = j

    out = map_ids[out]
    out, _, _ = segmentation.relabel_sequential(out)
    return out

min_pixels = int(min_area_fraction * labels_merged.size)
labels_clean = merge_tiny_regions_fast(labels_merged, lab, min_pixels=min_pixels)

# safer label smoothing
labels_smooth = segmentation.expand_labels(labels_clean, distance=1)

# -------------------
# interactive layer builder + optional exports
# -------------------
H, W = labels_smooth.shape
unique_labels = np.unique(labels_smooth)

def interactive_layer_builder(img_bgr, labels_initial, out_dir, display_max=1100, *,
                              rag=None, labels_slic=None, rgb_for_merge=None,
                              min_area_fraction_ui=None, init_thresh=None,
                              lab_image=None, base_n_segments=None, slic_compactness=None):
    # local working labels that may be updated by the threshold trackbar
    labels = labels_initial.copy()
    h, w = labels.shape
    scale = min(display_max / max(h, w), 1.0)
    disp_size = (int(w * scale), int(h * scale))

    # Selection state
    selected = set()
    sel_mask = np.zeros((h, w), np.uint8)
    boundaries = segmentation.find_boundaries(labels, mode='outer')

    def render():
        canvas = img_bgr.copy()
        if np.any(sel_mask):
            m = sel_mask > 0
            canvas[m] = (0.6 * canvas[m] + 0.4 * np.array([0, 255, 0])).astype(np.uint8)
        # draw boundaries in white for guidance
        b = boundaries
        canvas[b] = (255, 255, 255)
        return cv2.resize(canvas, disp_size) if scale < 1.0 else canvas

    # Build simplified contours for the current selection mask
    def selection_contours():
        if not np.any(sel_mask):
            return []
        mask_bin = (sel_mask > 0).astype(np.uint8)
        contours, _ = cv2.findContours(mask_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        polys = []
        for cnt in contours:
            if len(cnt) < 3:
                continue
            eps = float(state.get("smooth", simplify_tol))
            approx = cv2.approxPolyDP(cnt, eps, True).reshape(-1, 2)
            if approx.shape[0] >= 3:
                polys.append(approx)
        return polys

    # Render a live vector preview window of the current selection
    def render_vector_preview():
        if not state.get("show_preview", False):
            return
        if not np.any(sel_mask):
            # empty selection
            preview = np.ones((h, w, 3), np.uint8) * 255
            msg = "No selection"
            cv2.putText(preview, msg, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0,0,0), 2, cv2.LINE_AA)
        else:
            preview = np.ones((h, w, 3), np.uint8) * 255
            fill_col = img_bgr[sel_mask > 0].mean(axis=0).astype(np.uint8).tolist()  # BGR
            polys = selection_contours()
            # fill and stroke
            for poly in polys:
                pts = poly.reshape(-1, 1, 2)
                cv2.fillPoly(preview, [pts], color=fill_col)
                cv2.polylines(preview, [pts], isClosed=True, color=(0,0,0), thickness=1, lineType=cv2.LINE_AA)
        disp = cv2.resize(preview, disp_size) if scale < 1.0 else preview
        cv2.imshow("Vector Preview", disp)

    state = {
        "need": True,
        "reseg": False,
        "reslic": False,
        "target_thresh": int(init_thresh) if init_thresh is not None else int(lab_merge_thresh),
        "target_segments": int(base_n_segments) if base_n_segments is not None else n_segments,
        "target_compact": int(slic_compactness) if slic_compactness is not None else int(compactness),
        "cut_mode": False,
        "cut_p1": None,
        "show_preview": False,
    }

    last_xy = [0, 0]
    def on_mouse(ev, x, y, flags, param):
        nonlocal sel_mask, last_xy, boundaries
        ox = int(round(x / scale)); oy = int(round(y / scale))
        ox = max(0, min(w - 1, ox)); oy = max(0, min(h - 1, oy))
        last_xy = [ox, oy]
        # Ignore double-click synthesized events
        if ev == cv2.EVENT_LBUTTONDBLCLK:
            return
        # Debounce rapid repeats (<250ms)
        now = time.time()
        last = state.get("last_click_ts", 0.0)
        if ev in (cv2.EVENT_LBUTTONDOWN, cv2.EVENT_LBUTTONUP) and (now - last) < 0.25:
            return
        if ev == cv2.EVENT_LBUTTONUP:
            if 0 <= ox < w and 0 <= oy < h:
                if state["cut_mode"]:
                    # Cutting mode: first click sets p1, second applies cut to region
                    if state["cut_p1"] is None:
                        state["cut_p1"] = (ox, oy)
                        print("Cut start set. Click second point to cut.")
                    else:
                        x1, y1 = state["cut_p1"]; x2, y2 = ox, oy
                        lab_target = int(labels[y1, x1])
                        # Only cut inside this region
                        region_mask = (labels == lab_target)
                        if region_mask[y2, x2] == 0:
                            print("Second point not in the same region; cancelling cut.")
                        else:
                            # carve a line through the region
                            cut = np.zeros((h, w), np.uint8)
                            cv2.line(cut, (x1, y1), (x2, y2), color=1, thickness=3)
                            # remove cut pixels from region
                            region_after = region_mask & (cut == 0)
                            comps = measure.label(region_after.astype(np.uint8), connectivity=1)
                            num = comps.max()
                            if num >= 2:
                                # assign the component containing (x2,y2) to a new label
                                comp_id = int(comps[y2, x2])
                                if comp_id == 0:
                                    # if the cut grazed the edge, pick any nonzero comp different from the (x1,y1) side
                                    comp_id = 1
                                new_id = int(labels.max()) + 1
                                # pixels belonging to comp_id get new label
                                labels[(comps == comp_id)] = new_id
                                print(f"Cut applied. New label {new_id} created from region {lab_target}.")
                                # reset selection and boundaries
                                selected.clear(); sel_mask[:] = 0
                                boundaries = segmentation.find_boundaries(labels, mode='outer')
                                state["need"] = True
                            else:
                                print("Cut did not split the region; try a thicker or different cut.")
                        # exit cut mode
                        state["cut_p1"] = None
                        state["cut_mode"] = False
                else:
                    lab = int(labels[oy, ox])
                    if lab in selected:
                        selected.remove(lab)
                        sel_mask[labels == lab] = 0
                        print(f"Deselected region {lab}")
                    else:
                        selected.add(lab)
                        sel_mask[labels == lab] = 255
                        print(f"Selected region {lab}")
                    state["need"] = True
            state["last_click_ts"] = now

    win = "Layer Builder"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win, *disp_size)
    cv2.setMouseCallback(win, on_mouse)

    # Ensure the window becomes responsive and focused
    initial = render()
    cv2.imshow(win, initial)
    try:
        # Try to bring to front if supported
        cv2.setWindowProperty(win, cv2.WND_PROP_TOPMOST, 1)
        cv2.setWindowProperty(win, cv2.WND_PROP_TOPMOST, 0)
    except Exception:
        pass
    for _ in range(5):
        cv2.waitKey(10)

    # Optional trackbar to adjust color distance threshold (ΔE in LAB)
    def on_trackbar(pos):
        # guard range 1..60
        pos = max(1, min(60, int(pos)))
        state["target_thresh"] = pos
        state["reseg"] = True
        state["need"] = True

    cv2.createTrackbar("ΔE", win, int(state["target_thresh"]), 60, on_trackbar)

    # SLIC segments trackbar (range 300..3000)
    def on_trackbar_slic(pos):
        pos = max(300, min(3000, int(pos)))
        state["target_segments"] = pos
        state["reslic"] = True
        state["need"] = True

    cv2.createTrackbar("SLIC segs", win, int(state["target_segments"]), 3000, on_trackbar_slic)

    # SLIC compactness trackbar (range 1..40)
    def on_trackbar_comp(pos):
        pos = max(1, min(40, int(pos)))
        state["target_compact"] = pos
        state["reslic"] = True
        state["need"] = True

    cv2.createTrackbar("Compactness", win, int(state["target_compact"]), 40, on_trackbar_comp)

    # Smoothing trackbar for vector simplification (0.0 .. 5.0 px)
    def on_trackbar_smooth(pos):
        # store as float in pixels
        state["smooth"] = max(0.0, float(pos) / 10.0)
        state["need"] = True

    init_smooth = int(round(float(simplify_tol) * 10))
    state["smooth"] = float(init_smooth) / 10.0
    cv2.createTrackbar("Smooth x0.1px", win, init_smooth, 50, on_trackbar_smooth)

    print(
        "\nLayer Builder:\n"
        "- Left-click: toggle region selection\n"
        "- s: save current selection to RGBA (group_##.png)\n"
        "- c: clear selection\n"
        "- x: split region under cursor by color (KMeans-2)\n"
        "- b: split by drawing a line across a region (two clicks)\n"
        "- v: toggle Vector Preview window\n"
        "- Smooth trackbar: adjusts vector smoothing and SVG export\n"
        "- e: export current selection to SVG (group_##.svg)\n"
        "- o: export ALL regions to SVG (all_shapes.svg)\n"
        "- ESC: quit\n"
    )

    idx = 1
    while True:
        # Recompute SLIC and RAG if SLIC slider changed and we have inputs
        if state.get("reslic", False) and rgb_for_merge is not None and lab_image is not None:
            segs = int(state.get("target_segments", n_segments))
            comp = int(state.get("target_compact", compactness))
            labels_slic = segmentation.slic(rgb_for_merge, n_segments=segs, compactness=comp, start_label=0)
            labels_slic = util.img_as_int(labels_slic)
            # rebuild RAG
            rag = graph.rag_mean_color(lab_image, labels_slic, mode='distance')
            state["reslic"] = False
            state["reseg"] = True  # also trigger merge with current ΔE

        # Re-segmentation if threshold changed and we have the graph & slic
        if state.get("reseg", False) and rag is not None and labels_slic is not None:
            th = float(state.get("target_thresh", lab_merge_thresh))
            # cut threshold on precomputed RAG
            labels_merged2 = graph.cut_threshold(labels_slic, rag, thresh=th, in_place=False)
            # merge tiny regions and smooth labels safely
            maf = min_area_fraction if min_area_fraction_ui is None else min_area_fraction_ui
            min_pixels2 = int(maf * labels_merged2.size)
            labels_clean2 = merge_tiny_regions_fast(labels_merged2, lab_image if lab_image is not None else cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB), min_pixels=min_pixels2)
            labels = segmentation.expand_labels(labels_clean2, distance=1)
            # reset selection and boundaries
            selected.clear(); sel_mask[:] = 0
            boundaries = segmentation.find_boundaries(labels, mode='outer')
            state["reseg"] = False
            state["need"] = True

        if state.get("need", True):
            frame = render()
            cv2.imshow(win, frame)
            # update vector preview if enabled
            render_vector_preview()
            state["need"] = False
        k = cv2.waitKey(30) & 0xFF
        if k == 27:
            break
        elif k == ord('c'):
            selected.clear(); sel_mask[:] = 0; state["need"] = True
        elif k == ord('s'):
            if np.any(sel_mask):
                out = np.zeros((h, w, 4), dtype=np.uint8)
                # Keep BGR for cv2.imwrite to ensure correct colors
                out[..., :3] = img_bgr
                out[..., 3] = sel_mask
                save_path = os.path.join(out_dir, f"group_{idx:02d}.png")
                cv2.imwrite(save_path, out)
                print(f"✅ Saved {save_path}  (regions: {len(selected)})")
                idx += 1
            else:
                print("Nothing selected to save.")
        elif k == ord('x'):
            # Split the region under the cursor using KMeans in Lab
            if lab_image is None:
                print("Split requires Lab image.")
                continue
            cx, cy = last_xy
            if 0 <= cx < w and 0 <= cy < h:
                target_lab = int(labels[cy, cx])
                region_mask = (labels == target_lab)
                region_size = int(region_mask.sum())
                if region_size < 50:
                    print("Region too small to split.")
                    continue
                pts = lab_image[region_mask].reshape(-1, 3).astype(np.float32)
                try:
                    km = KMeans(n_clusters=2, n_init=5, random_state=0)
                    lab_ids = km.fit_predict(pts)
                except Exception as e:
                    print(f"KMeans split failed: {e}")
                    continue
                # Assign a new label id for one of the clusters
                new_id = int(labels.max()) + 1
                # Map cluster 1 to new_id, cluster 0 keeps original
                region_indices = np.flatnonzero(region_mask)
                # Build a flat view to assign faster
                flat = labels.reshape(-1)
                flat[region_indices[lab_ids == 1]] = new_id
                labels = labels.reshape(h, w)
                # Clear selection for stability and recompute boundaries
                selected.clear(); sel_mask[:] = 0
                boundaries = segmentation.find_boundaries(labels, mode='outer')
                state["need"] = True
        elif k == ord('b'):
            # enter cut mode; next two clicks will define the cut line
            state["cut_mode"] = True
            state["cut_p1"] = None
            print("Cut mode: click two points within the same region to draw a cutting line.")
        elif k == ord('v'):
            # toggle preview window
            state["show_preview"] = not state.get("show_preview", False)
            if not state["show_preview"]:
                try:
                    cv2.destroyWindow("Vector Preview")
                except cv2.error:
                    pass
            state["need"] = True
        elif k == ord('e'):
            # export current selection as SVG
            if not np.any(sel_mask):
                print("Nothing selected to export.")
            else:
                # one group per selected label, but MONOCHROME fill
                svg_path = os.path.join(out_dir, f"group_{idx:02d}.svg")
                dwg = svgwrite.Drawing(svg_path, size=(w, h))
                try:
                    dwg.viewbox(0, 0, w, h)
                except Exception:
                    pass
                # Mono color: pick the largest selected region's mean color
                sel_labels_sorted = sorted(selected, key=lambda lab: int((labels == lab).sum()), reverse=True)
                if sel_labels_sorted:
                    ref_lab = sel_labels_sorted[0]
                else:
                    ref_lab = int(labels.max())
                ref_mask = (labels == ref_lab)
                mono_col_bgr = img_bgr[ref_mask].mean(axis=0).astype(int).tolist()
                mono_fill = svgwrite.rgb(mono_col_bgr[2], mono_col_bgr[1], mono_col_bgr[0])
                # sort for stable order
                for lab_id in sorted(selected):
                    mask_lab = (labels == lab_id).astype(np.uint8)
                    contours, _ = cv2.findContours(mask_lab, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
                    if not contours:
                        continue
                    fill = mono_fill
                    grp = dwg.g(id=f"shape_{lab_id:03d}")
                    for cnt in contours:
                        eps = float(state.get("smooth", simplify_tol))
                        approx = cv2.approxPolyDP(cnt, eps, True).reshape(-1, 2)
                        if approx.shape[0] < 3:
                            continue
                        path_cmd = "M " + " L ".join([f"{int(x)},{int(y)}" for x, y in approx]) + " Z"
                        grp.add(dwg.path(d=path_cmd, fill=fill, stroke="none"))
                    dwg.add(grp)
                try:
                    dwg.save()
                    print(f"✅ Exported {svg_path}  (regions: {len(selected)})")
                    idx += 1
                except Exception as e:
                    print(f"Failed to save SVG: {e}")
        elif k == ord('o'):
            # export all regions from current labels
            svg_path = os.path.join(out_dir, "all_shapes.svg")
            dwg = svgwrite.Drawing(svg_path, size=(w, h))
            try:
                dwg.viewbox(0, 0, w, h)
            except Exception:
                pass
            # Mono color: choose largest region in full label map
            labs, counts = np.unique(labels, return_counts=True)
            ref_lab = int(labs[np.argmax(counts)])
            mono_col_bgr = img_bgr[labels == ref_lab].mean(axis=0).astype(int).tolist()
            mono_fill = svgwrite.rgb(mono_col_bgr[2], mono_col_bgr[1], mono_col_bgr[0])
            for lab_id in sorted(np.unique(labels)):
                mask_lab = (labels == int(lab_id)).astype(np.uint8)
                contours, _ = cv2.findContours(mask_lab, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
                if not contours:
                    continue
                fill = mono_fill
                grp = dwg.g(id=f"shape_{int(lab_id):03d}")
                for cnt in contours:
                    eps = float(state.get("smooth", simplify_tol))
                    approx = cv2.approxPolyDP(cnt, eps, True).reshape(-1, 2)
                    if approx.shape[0] < 3:
                        continue
                    path_cmd = "M " + " L ".join([f"{int(x)},{int(y)}" for x, y in approx]) + " Z"
                    grp.add(dwg.path(d=path_cmd, fill=fill, stroke="none"))
                dwg.add(grp)
            try:
                dwg.save()
                print(f"✅ Exported {svg_path} (all regions)")
            except Exception as e:
                print(f"Failed to save SVG: {e}")

    cv2.destroyAllWindows()
    return labels, state.get("smooth", float(simplify_tol))

# Optional: export individual masks/colors/rgba per label (pre-interactive)
if auto_export_individual:
    for lab_id in unique_labels:
        mask = (labels_smooth == lab_id).astype(np.uint8) * 255
        cv2.imwrite(os.path.join(out_dir, f"mask_{int(lab_id):03d}.png"), mask)
        mean_col = rgb[labels_smooth == lab_id].mean(axis=0).astype(np.uint8)
        with open(os.path.join(out_dir, f"color_{int(lab_id):03d}.txt"), "w") as f:
            f.write(f"{int(mean_col[0])},{int(mean_col[1])},{int(mean_col[2])}\n")
        rgba = np.dstack([bgr, mask])
        cv2.imwrite(os.path.join(out_dir, f"layer_{int(lab_id):03d}.png"), rgba)

# Launch interactive tool (with live ΔE control) and export final shapes
labels_final, smooth_final = interactive_layer_builder(
    bgr,
    labels_smooth,
    out_dir,
    display_max=display_max,
    rag=rag,
    labels_slic=labels_slic,
    rgb_for_merge=rgb_blur,
    lab_image=lab,
    base_n_segments=n_segments,
    slic_compactness=compactness,
    min_area_fraction_ui=min_area_fraction,
    init_thresh=lab_merge_thresh,
)

# Export SVG from the final labels after edits
H, W = labels_final.shape
dwg = svgwrite.Drawing(os.path.join(out_dir, "shapes.svg"), size=(W, H))
try:
    dwg.viewbox(0, 0, W, H)
except Exception:
    pass
labs_final = np.unique(labels_final)
# Mono color based on largest region in final labels
labs_counts = np.bincount(labels_final.ravel()) if labs_final.max() == len(labs_final)-1 else np.array([np.sum(labels_final==l) for l in labs_final])
ref_lab_final = int(labs_final[np.argmax(labs_counts)])
mono_col_bgr_final = bgr[labels_final == ref_lab_final].mean(axis=0).astype(int).tolist()
mono_fill_final = svgwrite.rgb(mono_col_bgr_final[2], mono_col_bgr_final[1], mono_col_bgr_final[0])
for lab_id in labs_final:
    mask = (labels_final == lab_id).astype(np.uint8)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        continue
    fill = mono_fill_final
    grp = dwg.g(id=f"shape_{int(lab_id):03d}")
    for cnt in contours:
        approx = cv2.approxPolyDP(cnt, float(smooth_final), True).reshape(-1, 2)
        if approx.shape[0] < 3:
            continue
        path_cmd = "M " + " L ".join([f"{int(x)},{int(y)}" for x, y in approx]) + " Z"
        grp.add(dwg.path(d=path_cmd, fill=fill, stroke="none"))
    dwg.add(grp)
dwg.save()

print(f"Ready. Regions detected: {len(np.unique(labels_final))}. Files saved in {out_dir}")
