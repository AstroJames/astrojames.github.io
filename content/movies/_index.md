---
title: Movies
summary: Numerical experiments and simulations that are easier to appreciate in motion than in text.
type: page
models:
  - label: 'Demo cube'
    file: '/models/cube_demo.ply'
  - label: 'SNR cluster 26 (preview)'
    file: '/models/clustering_cache_00030_cluster_26_surface_preview.ply'
  - label: 'SNR cluster 26 (full resolution)'
    file: '/models/clustering_cache_00030_cluster_26_surface.ply'
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

Interactively explore 3D point-cloud surfaces exported from volume renders. Drag to rotate, scroll to zoom, or use the dropdown to switch data products.

Default selection loads a down-sampled preview for faster interaction. Switch to the full-resolution entry once you're ready—the initial load may take longer.

{{< ply_viewer >}}
