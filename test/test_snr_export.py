"""Scientific registration and packaged-data checks for the SNR explorer."""
import importlib.util
import json
from pathlib import Path
import unittest
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('snr_export',ROOT/'scripts/export_snr_explorer.py')
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


class RegistrationTests(unittest.TestCase):
    def test_asymmetric_vector_field_preserves_physical_axes(self):
        # Analytic vector field with different axis/component dependence.
        x,y,z=np.indices((9,10,11),dtype=float)
        fields=[2*x+3*y-z, x-5*y+2*z, -3*x+y+7*z]
        points=np.array([[1.25,3.5,5.75],[5.6,7.1,2.3]])
        actual=np.stack([exporter.sample(a,points) for a in fields],axis=1)
        expected=points @ np.array([[2,1,-3],[3,-5,1],[-1,2,7]])
        np.testing.assert_allclose(actual,expected)

    def test_all_packaged_arrays_are_finite_and_in_bounds(self):
        folder=ROOT/'static/models/snr26'
        meta=json.loads((folder/'manifest.json').read_text())
        buffer=(folder/meta['binary']).read_bytes()
        self.assertEqual(len(buffer),meta['bytes'])
        arrays={}
        end=0
        for name,a in meta['arrays'].items():
            self.assertEqual(a['offset'],end)
            values=np.frombuffer(buffer,dtype=a['dtype'],count=a['count'],offset=a['offset'])
            self.assertTrue(np.isfinite(values).all(),name)
            self.assertEqual(np.prod(a['shape']),a['count'])
            arrays[name]=values.reshape(a['shape']);end+=values.nbytes
        self.assertEqual(end,len(buffer))
        self.assertLess(arrays['triangles'].max(),len(arrays['positions']))
        self.assertGreaterEqual(arrays['triangles'].min(),0)
        self.assertTrue((abs(arrays['positions'])<=.5).all())
        self.assertTrue((abs(arrays['alignment'])<=1).all())
        self.assertEqual(len(arrays['arrowPositions']),800)
        for field in meta['scalars']:
            self.assertEqual(len(arrays[field['key']]),len(arrays['positions']))
            self.assertLess(*field['range'])
        for field in meta['vectors']:
            self.assertEqual(arrays[field['key']].shape,(800,3))
            self.assertGreater(field['p95'],0)
        self.assertLess(meta['validation']['curl_relative_error'],1e-5)
        self.assertLess(meta['validation']['baroclinic_relative_error'],1e-5)
        self.assertIn(meta['baroclinic_convention']['stored_to_physical_sign'],[-1,1])
        # The signed colors must agree with the actual arrow vectors at their anchors.
        from scipy.spatial import cKDTree
        distance, index=cKDTree(arrays['positions']).query(arrays['arrowPositions'])
        self.assertTrue((distance==0).all())
        omega,baro=arrays['vorticity'].astype(float),arrays['baroclinic'].astype(float)
        scalar_by_key={v['key']:v for v in meta['scalars']}
        reference=scalar_by_key['omega_mag']['reference']*scalar_by_key['baro_mag']['reference']
        production=np.sum(omega*baro,axis=1)/reference
        alignment=np.sum(omega*baro,axis=1)/(np.linalg.norm(omega,axis=1)*np.linalg.norm(baro,axis=1))
        np.testing.assert_allclose(arrays['production'][index],production,rtol=1e-4,atol=1e-7)
        np.testing.assert_allclose(arrays['alignment'][index],alignment,rtol=1e-4,atol=1e-7)


if __name__=='__main__': unittest.main()
