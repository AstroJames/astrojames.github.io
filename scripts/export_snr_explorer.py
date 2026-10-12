#!/usr/bin/env python3
"""Export a fixed baroclinic shell with correctly registered scientific fields.

Input arrays and vector components use physical x,y,z order. Never reverse the
marching-cubes coordinates when sampling. Outputs contain normalized quantities;
no conversion to unrecorded physical units is assumed.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
import h5py
import numpy as np
from scipy.ndimage import gaussian_filter, map_coordinates
from skimage.measure import marching_cubes


def sample(volume, voxel_xyz):
    return map_coordinates(volume, np.asarray(voxel_xyz).T, order=1, mode='nearest')


def sparse_indices(points, count=800):
    """Deterministic farthest-point sampling; every prefix remains well spaced."""
    distance = np.full(len(points), np.inf)
    selected = []
    index = int(np.argmin(points[:, 0]))
    for _ in range(min(count, len(points))):
        selected.append(index)
        distance = np.minimum(distance, np.sum((points-points[index])**2, axis=1))
        index = int(np.argmax(distance))
    return np.array(selected)


def distribution(values, weights=None, bins=80):
    """Density in the displayed variable, normalized over finite samples."""
    values = np.asarray(values).ravel()
    weights = np.ones(values.size) if weights is None else np.asarray(weights).ravel()
    valid = np.isfinite(values) & np.isfinite(weights) & (weights > 0)
    assert valid.any()
    excluded = 1-float(weights[valid].sum()/weights.sum())
    counts, edges = np.histogram(values[valid], bins=bins, weights=weights[valid])
    density = counts/(counts.sum()*np.diff(edges))
    return dict(edges=edges.tolist(), density=density.tolist(), excluded_weight_fraction=excluded)


def logarithm(values):
    with np.errstate(divide='ignore', invalid='ignore'):
        return np.where(values > 0, np.log10(values), np.nan)


def export(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    with h5py.File(source) as f:
        data = {key: f[key][...].astype(np.float64) for key in f if key != 'cluster_mask'}
        mask = f['cluster_mask'][...].astype(bool)
        center = f.attrs['center_vox'].tolist() if 'center_vox' in f.attrs else None
    assert mask.any() and all(np.isfinite(a).all() for a in data.values())
    shape = data['density'].shape
    assert shape == (128, 128, 128)
    # Validate axis order against an independent, stored physical vector field.
    velocity = np.stack([data['v'+axis] for axis in 'xyz'])
    omega = np.stack([data['omega_'+axis] for axis in 'xyz'])
    gradients = [np.gradient(component) for component in velocity]
    curl = np.stack([gradients[2][1]-gradients[1][2], gradients[0][2]-gradients[2][0], gradients[1][0]-gradients[0][1]])
    interior = (slice(None),)+(slice(3,-3),)*3
    a, b = curl[interior].ravel(), omega[interior].ravel()
    derivative_scale = np.dot(a,b)/np.dot(a,a)
    curl_error = np.linalg.norm(derivative_scale*a-b)/np.linalg.norm(b)
    assert derivative_scale > 0 and curl_error < 1e-5, 'Unverified physical axis convention'
    baro = np.stack([data['baro_'+axis] for axis in 'xyz'])
    # Saved source vectors may use the opposite cross-product convention.
    # The displayed physical source is curl(-grad(P)/rho) = grad(rho) x grad(P)/rho².
    density, pressure = data['density'], data['pressure']
    physical = np.cross(np.stack(np.gradient(density)), np.stack(np.gradient(pressure)),
                        axisa=0, axisb=0, axisc=0)/density**2
    physical_flat, stored_flat = physical[interior].ravel(), baro[interior].ravel()
    baro_scale = np.dot(physical_flat,stored_flat)/np.dot(physical_flat,physical_flat)
    baro_error = np.linalg.norm(baro_scale*physical_flat-stored_flat)/np.linalg.norm(stored_flat)
    assert baro_error < 1e-5 and abs(abs(baro_scale)/derivative_scale**2-1) < 1e-5
    baro_sign = int(np.sign(baro_scale))
    baro *= baro_sign
    for index, axis in enumerate('xyz'):
        data['baro_'+axis] = baro[index]
    temperature_error = np.linalg.norm(data['temperature']-pressure/density)/np.linalg.norm(data['temperature'])
    assert temperature_error < 1e-5, 'Temperature field is not the P/rho proxy'
    for vec, name in [(omega, 'omega_mag'), (baro, 'baro_mag')]:
        assert np.allclose(np.linalg.norm(vec, axis=0), data[name], rtol=2e-6, atol=1e-12)
    smooth = gaussian_filter(data['baro_mag'], .8, mode='nearest')
    level = np.percentile(smooth, 95)
    voxel, faces, normals, _ = marching_cubes(smooth, level)
    # Centered cutout coordinates: one length unit is the full 128-voxel cutout.
    positions = voxel/128.0-.5
    ids = sparse_indices(positions)
    binary = bytearray()
    arrays = {}
    def put(name, values, dtype='<f4'):
        values = np.asarray(values, dtype=dtype)
        arrays[name] = dict(offset=len(binary), count=values.size, shape=list(values.shape), dtype=dtype)
        binary.extend(values.tobytes())
    put('positions', positions)
    put('triangles', faces, '<u4')
    put('arrowPositions', positions[ids])
    # Lump one third of each triangle's area onto each incident vertex.
    triangles = positions[faces]
    area = np.linalg.norm(np.cross(triangles[:,1]-triangles[:,0], triangles[:,2]-triangles[:,0]), axis=1)/2
    weights = np.bincount(faces.ravel(), weights=np.repeat(area/3,3), minlength=len(voxel))
    distributions = {}
    def pdf(key, shell_values, interior_values):
        distributions[key] = dict(shell=distribution(shell_values, weights), interior=distribution(interior_values))
    scalars = []
    norms = {}
    for key, label, symbol, method in [
        ('density','Density','ρ / ⟨ρ⟩','mean'),
        ('temperature','Temperature proxy','(P/ρ) / ⟨P/ρ⟩','mean'),
        ('pressure','Pressure','P / ⟨P⟩','mean'),
        ('omega_mag','Vorticity magnitude','|ω| / ωrms','rms'),
        ('baro_mag','Baroclinic-source magnitude','|b| / brms','rms')]:
        vol = data[key]
        reference = float(np.mean(vol[mask]) if method=='mean' else np.sqrt(np.mean(vol[mask]**2)))
        assert reference > 0
        sampled = sample(vol, voxel)/reference
        assert np.all(sampled > 0)
        values = np.log10(sampled)
        put(key, values)
        pdf(key, values, logarithm(vol[mask]/reference))
        low, high = np.percentile(values, [2,98])
        scalars.append(dict(key=key,label=label,legend=f'log₁₀({symbol})',range=[float(low),float(high)],palette='sequential',reference=reference))
        norms[key] = reference
    # Dot the interpolated vectors, not separately interpolated products.
    sampled_omega = np.stack([sample(a,voxel) for a in omega],axis=1)
    sampled_baro = np.stack([sample(a,voxel) for a in baro],axis=1)
    production = np.sum(sampled_omega*sampled_baro,axis=1)/(norms['omega_mag']*norms['baro_mag'])
    put('production', production)
    volume_dot = np.sum(omega[:,mask]*baro[:,mask],axis=0)
    pdf('production', production, volume_dot/(norms['omega_mag']*norms['baro_mag']))
    limit = float(np.percentile(np.abs(production),98))
    scalars.append(dict(key='production',label='Signed baroclinic contribution',legend='ω · b / (ωrms brms)',range=[-limit,limit],palette='diverging'))
    denom = np.linalg.norm(sampled_omega,axis=1)*np.linalg.norm(sampled_baro,axis=1)
    alignment = np.divide(np.sum(sampled_omega*sampled_baro,axis=1),denom,out=np.zeros_like(denom),where=denom>0)
    put('alignment',np.clip(alignment,-1,1))
    volume_denom = np.linalg.norm(omega[:,mask],axis=0)*np.linalg.norm(baro[:,mask],axis=0)
    volume_alignment = np.divide(volume_dot, volume_denom, out=np.full_like(volume_dot,np.nan), where=volume_denom>0)
    pdf('alignment', np.where(denom>0,np.clip(alignment,-1,1),np.nan), np.clip(volume_alignment,-1,1))
    scalars.append(dict(key='alignment',label='Vorticity–source alignment',legend='cos θ = ω · b / (|ω| |b|)',range=[-1,1],palette='diverging'))
    vectors=[]
    for key,label,components in [
        ('velocity','Velocity',['v'+a for a in 'xyz']),
        ('vorticity','Vorticity',['omega_'+a for a in 'xyz']),
        ('baroclinic','Baroclinic source',['baro_'+a for a in 'xyz']),
        ('solenoidal','Solenoidal velocity',['u_s'+a for a in 'xyz']),
        ('compressive','Compressive velocity',['u_c'+a for a in 'xyz'])]:
        surface_vectors=np.stack([sample(data[c],voxel) for c in components],axis=1)
        values=surface_vectors[ids]
        interior_magnitude=np.linalg.norm(np.stack([data[c][mask] for c in components]),axis=0)
        reference=float(np.sqrt(np.mean(interior_magnitude**2)))
        pdf('vector_'+key, logarithm(np.linalg.norm(surface_vectors,axis=1)/reference), logarithm(interior_magnitude/reference))
        put(key,values)
        vectors.append(dict(key=key,label=label,distribution_key='vector_'+key,distribution_legend=f'log₁₀(|{label.lower()}| / RMS)',reference=reference,p95=float(np.percentile(np.linalg.norm(values,axis=1),95))))
    # Synthetic affine-field check detects transposition without symmetry assumptions.
    coords=np.indices((7,8,9),dtype=float);test=coords[0]+10*coords[1]+100*coords[2]
    points=np.array([[1.3,2.1,4.7],[4.2,3.8,1.1]])
    assert np.allclose(sample(test,points),points@np.array([1,10,100]))
    match=re.fullmatch(r'clustering_cache_(\d+)_cluster_(\d+)\.h5',source.name)
    assert match, 'Unrecognized remnant filename'
    output, cluster=match.groups()
    manifest=dict(version=2,title=f'SNR {int(cluster)} · output {output}',output=output,cluster_id=int(cluster),source=source.name,
        distributions=distributions,
        distribution_method='80 bins spanning the full finite range. Shell: vertex samples weighted by one third of incident triangle areas (area-lumped approximation). Interior: equal-volume cells in cluster_mask. Density integrates to one over included samples. Logarithmic densities are per unit log10, not per unit untransformed field. Undefined values are excluded with their weight fraction reported. Camera, cutaway, opacity, and arrow count do not filter distributions.',
        source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),cube_shape=list(shape),center_global_voxels=center,
        binary='surface.bin',arrays=arrays,scalars=scalars,vectors=vectors,
        surface=dict(field='baro_mag',smoothing_sigma_voxels=.8,percentile=95,level=float(level),vertices=len(voxel),triangles=len(faces)),
        coordinates='Array axes and vector components are x,y,z. Positions are voxel/128 - 0.5. The cutout width is one coordinate unit.',
        normalization='Scalar means and RMS values are measured within cluster_mask. Positive scalars use log10; display limits are surface percentiles 2–98. Signed contribution uses symmetric 98th-percentile absolute limits. Colors saturate outside the displayed limits.',
        vector_encoding='Vectors are trilinearly sampled at farthest-point-spaced shell vertices. Equal-length arrows show direction; magnitude mode uses length/p95 capped at 1. Simulation-frame velocities; no bulk subtraction. All components remain three-dimensional.',
        baroclinic_convention=dict(definition='b = grad(rho) cross grad(P) / rho^2',stored_to_physical_sign=baro_sign,note='The saved vector is multiplied by this sign before arrow export, dot products, and alignment. Source HDF5 is unchanged.'),
        validation=dict(curl_relative_error=float(curl_error),curl_derivative_scale=float(derivative_scale),baroclinic_relative_error=float(baro_error),baroclinic_derivative_scale=float(baro_scale),temperature_proxy_relative_error=float(temperature_error),affine_interpolation_pass=True),
        bytes=len(binary))
    (destination/'surface.bin').write_bytes(binary)
    (destination/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(dict(bytes=len(binary),vertices=len(voxel),triangles=len(faces),curl_error=curl_error,derivative_scale=derivative_scale)))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('destination',type=Path)
    args=parser.parse_args();export(args.source,args.destination)
