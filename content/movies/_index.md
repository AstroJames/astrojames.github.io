---
title: Movies
summary: Numerical experiments and simulations that are easier to appreciate in motion than in text.
type: page
---

## Cooling supernovae remnants are turbulence engines. Extracted SNRs from disk cut-out simulations in [Beattie et al. (2025)](https://arxiv.org/abs/2501.09855)

{{< video
    src="movies/grid_vort_pingpong_x10.mp4"
    controls="yes"
    loop="yes"
    muted="yes"
    playsinline="yes"
>}}

*An animated version of Figure 2 from [Beattie (2025), submitted to ApJL](https://arxiv.org/abs/2509.07354), where I derive the power spectrum relation between a baroclinic source and an incompressible turbulence spectrum, which has direct applications for supernova-driven turbulence. Each panel is a supernova remnant, and the slider shows between the baroclinic magnitude (blue) and the vorticity magnitude (red).*

## Supernova Remnant Volume Viewer

Pick a model and explore it interactively.

<div class="model-viewer-block" style="margin: 2rem 0;">
  <label for="model-select" style="color: rgba(255,255,255,0.8); font-weight: 600; display: block; margin-bottom: 0.5rem;">Choose a model</label>
  <select id="model-select" style="background: rgba(0,0,0,0.35); color: #e5e7eb; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; padding: 0.6rem 1rem; min-width: 260px;">
    <option
      value="/models/clustering_cache_00030_cluster_26_surface.glb"
      data-alt="Clustering cache cluster 26 surface"
      data-caption="Surface exported from clustering cache output. Drag to rotate; scroll to zoom.">
      Cluster 26 surface (clustering cache)
    </option>
    <option
      value="/models/cube_demo.glb"
      data-alt="Geometry sanity check (colored cube)"
      data-caption="Sanity check for the new model pipeline. Click and drag to orbit; use scroll to zoom.">
      Cube demo
    </option>
  </select>

  <div id="viewer-host">
    {{< model_viewer
        src="/models/clustering_cache_00030_cluster_26_surface.glb"
        alt="Clustering cache cluster 26 surface"
        caption="Surface exported from clustering cache output. Drag to rotate; scroll to zoom."
        height="520px"
        loading="lazy"
        reveal="auto"
        camera_orbit="auto auto 2.5m"
        min_camera_orbit="auto auto 0.01m"
        max_camera_orbit="auto auto 8m"
        field_of_view="35deg"
        id="model-viewer-main"
    >}}
  </div>
</div>

<script>
  (function() {
    const select = document.getElementById('model-select');
    const host = document.getElementById('viewer-host');
    if (!select || !host) return;

    // The shortcode nests <model-viewer> inside its own wrapper; grab those nodes dynamically.
    const initialViewer = host.querySelector('model-viewer');
    const captionEl = host.querySelector('.model-viewer-block p');
    if (!initialViewer) return;
    const wrapper = initialViewer.parentElement || host;

    const baseAttrs = {};
    ['style', 'height', 'loading', 'reveal', 'camera-orbit', 'min-camera-orbit', 'max-camera-orbit', 'camera-target', 'field-of-view', 'shadow-intensity', 'exposure']
      .forEach(attr => {
        const val = initialViewer.getAttribute(attr);
        if (val !== null) baseAttrs[attr] = val;
      });

    function render(option) {
      if (!option) return;
      const src = option.value;
      const alt = option.dataset.alt || option.textContent.trim();
      const caption = option.dataset.caption || alt;

      const mv = document.createElement('model-viewer');
      mv.setAttribute('camera-controls', '');
      Object.entries(baseAttrs).forEach(([k, v]) => mv.setAttribute(k, v));
      mv.setAttribute('src', src);
      mv.setAttribute('alt', alt);

      // Replace current viewer with new one to force load of the new model.
      const current = wrapper.querySelector('model-viewer');
      if (current) {
        wrapper.replaceChild(mv, current);
      } else {
        wrapper.appendChild(mv);
      }

      if (captionEl) captionEl.textContent = caption;
    }

    select.addEventListener('change', () => render(select.selectedOptions[0]));
    // Render once on load to sync attributes and caption with the default option.
    render(select.selectedOptions[0]);
  })();
</script>
