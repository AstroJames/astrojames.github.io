---
title: Movies
summary: Explore shear-driven turbulence, magnetic-field stretching, and supernova remnants. Choose a movie below or rotate a remnant in three dimensions.
type: page
---

## Kelvin–Helmholtz instability {#kelvin-helmholtz}

Start with the two three-dimensional tours, then explore the evolving density, magnetic-field stretching, and vorticity. Use full screen to inspect fine structures and panel labels.

<div class="movie-grid">

{{< movie src="movies/KHI_density_smooth_flythrough_t200.mp4" title="Density fly-through" duration="0:28" size="15 MB" summary="Travel through the density structure of a Kelvin–Helmholtz simulation." >}}
A flight through the density field at a fixed time, $t/t_\Delta \simeq 200$, in a Mach 1 Kelvin–Helmholtz simulation with $\mathrm{Re}_\Delta = 16384$ and $\mathrm{Pm}_\Delta = 1$. Color shows the logarithmic density contrast, $\ln(\rho/\rho_0)$.
{{< /movie >}}

{{< movie src="movies/KHI_white_tubes_flythrough_t200.mp4" title="Magnetic-field fly-through" duration="0:28" size="42 MB" summary="Follow the magnetic-field geometry through the same density snapshot." >}}
Magnetic-field lines shown as white tubes over the density field at $t/t_\Delta \simeq 200$, with Mach 1, $\mathrm{Re}_\Delta = 16384$, and $\mathrm{Pm}_\Delta = 1$. Color shows $\ln(\rho/\rho_0)$.
{{< /movie >}}

{{< movie src="movies/Mach1_figure1.mp4" title="Density and magnetic-field stretching" duration="0:15" size="30 MB" summary="Compare density and field-aligned stretching in two perpendicular planes." wide="yes" >}}
Density and magnetic-field stretching in the $xy$ and $yz$ planes of the Mach 1 simulation. The density panels show $\rho/\langle\rho\rangle_0$, while the adjacent panels show the dimensionless stretching rate, $t_\Delta \hat{B}_i\hat{B}_j\partial_j u_i$. The Reynolds number is $\mathrm{Re}_\Delta = 16384$ and the magnetic Prandtl number is $\mathrm{Pm}_\Delta = 1$.
{{< /movie >}}

{{< movie src="movies/Mach1_vorticity_xy.mp4" title="Vorticity in the xy plane" duration="0:15" size="22 MB" summary="Compare ten Reynolds numbers in a slice through the shear layers." >}}
Vorticity magnitude in the $xy$ plane near $z/L = 0$. The ten panels compare Reynolds numbers from $\mathrm{Re}_\Delta = 64$ to $16384$ at Mach 1 and $\mathrm{Pm}_\Delta = 1$. Color shows $t_\Delta |\nabla\times\boldsymbol{u}|$.
{{< /movie >}}

{{< movie src="movies/Mach1_vorticity_yz.mp4" title="Vorticity in the yz plane" duration="0:15" size="23 MB" summary="View the same Reynolds-number sequence from a perpendicular direction." >}}
Vorticity magnitude in the $yz$ plane near $x/L = -1/4$. The ten panels compare $\mathrm{Re}_\Delta = 64$ to $16384$ at Mach 1 and $\mathrm{Pm}_\Delta = 1$. Color shows $t_\Delta |\nabla\times\boldsymbol{u}|$.
{{< /movie >}}

</div>

## Supernova remnants {#supernovae}

Cooling remnants extracted from galactic disk simulations in [Beattie et al. (2025)](https://arxiv.org/abs/2501.09855).

<div class="movie-grid movie-grid-supernova">

{{< movie src="movies/grid_vort_pingpong_x10.mp4" title="Supernova remnants as turbulence engines" duration="0:26" size="18 MB" summary="Compare baroclinic sources in blue with vorticity in red." >}}
An animated version of Figure 2 from [Beattie (2025), submitted to ApJL](https://arxiv.org/abs/2509.07354), where I derive the power spectrum relation between a baroclinic source and an incompressible turbulence spectrum, which has direct applications for supernova-driven turbulence. Each panel is a supernova remnant, and the slider shows between the baroclinic magnitude (blue) and the vorticity magnitude (red).
{{< /movie >}}

</div>

## Explore supernova remnants in 3D {#volume-viewer}

Explore SNR 26 with selectable fields and vector overlays, or browse the other remnant surfaces below.

{{< snr_explorer >}}

### Other remnant surfaces

These additional previews show remnant shapes; their colors are illustrative. Use the SNR 26 explorer above for field colors and vector overlays. Drag to rotate and scroll to zoom.

<div class="model-viewer-block" style="margin: 2rem 0;">
  <label for="model-select" style="color: rgba(255,255,255,0.8); font-weight: 600; display: block; margin-bottom: 0.5rem;">Choose a model</label>
  <select id="model-select" style="background: rgba(0,0,0,0.35); color: #e5e7eb; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; padding: 0.6rem 1rem; min-width: 260px;">
    <option
      value="/models/clustering_cache_00030_cluster_26_surface.glb"
      data-alt="Clustering cache cluster 26 surface"
      data-caption="Surface exported from clustering cache output. Drag to rotate; scroll to zoom.">
      SNR 26
    </option>
    <option
      value="/models/clustering_cache_00030_cluster_16_surface.glb"
      data-alt="Clustering cache cluster 16 surface"
      data-caption="Surface exported from clustering cache output. Drag to rotate; scroll to zoom.">
      SNR 16
    </option>
    <option
      value="/models/clustering_cache_00040_cluster_57_surface.glb"
      data-alt="Clustering cache cluster 57 surface"
      data-caption="Surface exported from clustering cache output. Drag to rotate; scroll to zoom.">
      SNR 57
    </option>
    <option
      value="/models/clustering_cache_00040_cluster_60_surface.glb"
      data-alt="Clustering cache cluster 60 surface"
      data-caption="Surface exported from clustering cache output. Drag to rotate; scroll to zoom.">
      SNR 60
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
        environment_image="neutral"
        tone_mapping="aces"
        shadow_softness="0.9"
        shadow="0.6"
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
    ['style', 'height', 'loading', 'reveal', 'camera-orbit', 'min-camera-orbit', 'max-camera-orbit', 'camera-target', 'field-of-view', 'shadow-intensity', 'exposure', 'environment-image', 'skybox-image', 'tone-mapping', 'shadow-softness']
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
