"""Full-volume package integrity and definitions for the on-demand explorer."""
import gzip,hashlib,json,unittest
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
class VolumeTests(unittest.TestCase):
    def test_lossless_field_groups(self):
        for name in ['snr26','snr16','snr57','snr60']:
            folder=ROOT/'static/models'/name
            meta=json.loads((folder/'volumes.json').read_text())
            original=json.loads((folder/'manifest.json').read_text())
            self.assertEqual(meta['source_sha256'],original['source_sha256'])
            self.assertEqual(meta['shape'],[128]*3)
            for group,spec in meta['groups'].items():
                with self.subTest(remnant=name,group=group):
                    packed=(folder/spec['file']).read_bytes()
                    self.assertEqual(len(packed),spec['bytes'])
                    shuffled=gzip.decompress(packed)
                    self.assertEqual(len(shuffled),spec['raw_bytes'])
                    restored=np.frombuffer(shuffled,dtype=np.uint8).reshape(4,-1).T.copy()
                    self.assertEqual(hashlib.sha256(restored.tobytes()).hexdigest(),spec['sha256'])
                    values=restored.view('<f4')
                    self.assertEqual(values.size,len(spec['components'])*128**3)
                    self.assertTrue(np.isfinite(values).all())
            for definitions in meta['fields'].values():
                for stats in definitions.values():
                    self.assertGreater(stats['min'],0)
                    self.assertLess(stats['min'],stats['p95'])
                    self.assertLess(stats['p95'],stats['max'])
if __name__=='__main__':unittest.main()
