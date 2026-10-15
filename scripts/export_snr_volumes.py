#!/usr/bin/env python3
"""Lossless full-resolution volumes, fetched by field group on demand."""
import argparse, gzip, hashlib, json
from pathlib import Path
import h5py
import numpy as np
from scipy.ndimage import gaussian_filter


def export(source, destination):
    meta=json.loads((destination/'manifest.json').read_text())
    assert hashlib.sha256(source.read_bytes()).hexdigest()==meta['source_sha256']
    references={s['key']:s['reference'] for s in meta['scalars'] if 'reference' in s}
    groups={'thermo':['density','pressure'],'velocity':['vx','vy','vz'],
            'vorticity':['omega_x','omega_y','omega_z'],'baroclinic':['baro_x','baro_y','baro_z'],
            'solenoidal':['u_sx','u_sy','u_sz'],'compressive':['u_cx','u_cy','u_cz']}
    result={'version':1,'shape':[128]*3,'encoding':'byte-shuffled little-endian float32, gzip; component-major, x/y/z array order',
            'groups':{},'fields':{},'source_sha256':meta['source_sha256']}
    with h5py.File(source) as f:
        for name,keys in groups.items():
            a=np.stack([f[k][...] for k in keys]).astype('<f4')
            if name=='baroclinic': a*=meta['baroclinic_convention']['stored_to_physical_sign']
            raw=a.tobytes()
            shuffled=np.frombuffer(raw,dtype=np.uint8).reshape(-1,4).T.copy().tobytes()
            packed=gzip.compress(shuffled,compresslevel=9,mtime=0)
            file=f'volume-{name}-v1.bin.gz';(destination/file).write_bytes(packed)
            result['groups'][name]={'file':file,'components':keys,'bytes':len(packed),'raw_bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
        for key in ['density','pressure','temperature','omega_mag','baro_mag']:
            # Derived fields share downloaded components and preserve full grid resolution.
            if key=='temperature': a=f['pressure'][...].astype(float)/f['density'][...]
            elif key in ['omega_mag','baro_mag']:
                prefix='omega_' if key=='omega_mag' else 'baro_'
                a=np.sqrt(sum(f[prefix+c][...].astype(float)**2 for c in 'xyz'))
            else:a=f[key][...].astype(float)
            stats={}
            for sigma in [0,.8]:
                smooth=gaussian_filter(a,sigma,mode='nearest') if sigma else a
                positive=smooth[smooth>0]
                stats[str(sigma)]={'min':float(positive.min()/references[key]),'max':float(positive.max()/references[key]),'p95':float(np.percentile(smooth,95)/references[key])}
            result['fields'][key]=stats
    (destination/'volumes.json').write_text(json.dumps(result,indent=2)+'\n')
    print(destination.name,round(sum(g['bytes'] for g in result['groups'].values())/1e6,2),'MB',flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('destination',type=Path)
    a=p.parse_args();export(a.source,a.destination)
