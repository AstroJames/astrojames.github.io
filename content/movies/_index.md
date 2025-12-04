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

Interactively explore 3D reconstructions exported as glTF models. Drag to rotate, scroll or pinch to zoom, and tap the AR button on supported devices to drop the remnant into your room.

{{< model_viewer
    src="/models/clustering_cache_00030_cluster_26_surface_preview.gltf"
    alt="Preview of supernova remnant cluster 26"
    caption="Preview remnant: 10× down-sampled mesh for quick interaction."
>}}

{{< model_viewer
    src="/models/clustering_cache_00030_cluster_26_surface.gltf"
    alt="Full-resolution supernova remnant cluster 26"
    caption="Full-resolution remnant from Beattie et al. (2025)."
    exposure="1.1"
>}}

{{< model_viewer
    src="/models/cube_demo.gltf"
    alt="Geometry sanity check"
    caption="Simple cube for debugging and verifying the viewer."
    height="360px"
>}}
