import argparse
import json
import math
import struct
from pathlib import Path


def parse_ply(path):
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.read().splitlines()

    if not lines or lines[0].strip() != 'ply':
        raise ValueError('Not a PLY file')

    vertex_count = face_count = 0
    vertex_props = []
    in_vertex = False
    header_end_idx = None

    for idx, line in enumerate(lines[1:], start=1):
        line = line.strip()
        if line == 'end_header':
            header_end_idx = idx + 1
            break
        parts = line.split()
        if not parts:
            continue
        keyword = parts[0]
        if keyword == 'element':
            in_vertex = parts[1] == 'vertex'
            if in_vertex:
                vertex_count = int(parts[2])
            elif parts[1] == 'face':
                face_count = int(parts[2])
        elif keyword == 'property' and in_vertex:
            vertex_props.append(parts[-1])

    if header_end_idx is None:
        raise ValueError('PLY header missing end_header')

    required = {'x', 'y', 'z'}
    if not required.issubset(set(vertex_props)):
        raise ValueError('PLY vertices must include x, y, z properties')

    vertices = []
    colors = []

    prop_indices = {name: idx for idx, name in enumerate(vertex_props)}

    line_idx = header_end_idx
    for _ in range(vertex_count):
        parts = lines[line_idx].split()
        line_idx += 1
        if len(parts) < len(vertex_props):
            raise ValueError('Vertex line has insufficient values')
        x = float(parts[prop_indices['x']])
        y = float(parts[prop_indices['y']])
        z = float(parts[prop_indices['z']])
        vertices.extend((x, y, z))
        r = int(parts[prop_indices['red']]) if 'red' in prop_indices else 200
        g = int(parts[prop_indices['green']]) if 'green' in prop_indices else 200
        b = int(parts[prop_indices['blue']]) if 'blue' in prop_indices else 220
        colors.extend((max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b))))

    indices = []
    for _ in range(face_count):
        if line_idx >= len(lines):
            break
        parts = lines[line_idx].split()
        line_idx += 1
        if not parts:
            continue
        count = int(parts[0])
        verts = list(map(int, parts[1:1 + count]))
        for i in range(1, len(verts) - 1):
            indices.extend((verts[0], verts[i], verts[i + 1]))

    return vertices, colors, indices


def write_gltf(vertices, colors, indices, out_base):
    out_base = Path(out_base)
    out_base.parent.mkdir(parents=True, exist_ok=True)

    min_vals = [math.inf, math.inf, math.inf]
    max_vals = [-math.inf, -math.inf, -math.inf]
    for i in range(0, len(vertices), 3):
        x, y, z = vertices[i:i+3]
        min_vals[0] = min(min_vals[0], x)
        min_vals[1] = min(min_vals[1], y)
        min_vals[2] = min(min_vals[2], z)
        max_vals[0] = max(max_vals[0], x)
        max_vals[1] = max(max_vals[1], y)
        max_vals[2] = max(max_vals[2], z)

    buffer = bytearray()

    def add_buffer(data: bytes):
        offset = len(buffer)
        buffer.extend(data)
        while len(buffer) % 4:
            buffer.append(0)
        return offset, len(data)

    pos_bytes = struct.pack(f'<{len(vertices)}f', *vertices)
    pos_offset, pos_length = add_buffer(pos_bytes)

    color_bytes = struct.pack(f'<{len(colors)}B', *colors)
    color_offset, color_length = add_buffer(color_bytes)

    use_uint16 = len(vertices) // 3 <= 65535 and max(indices, default=0) <= 65535
    if use_uint16:
        index_fmt = f'<{len(indices)}H'
        component_type = 5123
    else:
        index_fmt = f'<{len(indices)}I'
        component_type = 5125
    index_bytes = struct.pack(index_fmt, *indices)
    index_offset, index_length = add_buffer(index_bytes)

    bin_path = out_base.with_suffix('.bin')
    with open(bin_path, 'wb') as f:
        f.write(buffer)

    gltf = {
        'asset': {'version': '2.0'},
        'buffers': [{'byteLength': len(buffer), 'uri': bin_path.name}],
        'bufferViews': [
            {'buffer': 0, 'byteOffset': pos_offset, 'byteLength': pos_length, 'target': 34962},
            {'buffer': 0, 'byteOffset': color_offset, 'byteLength': color_length, 'target': 34962},
            {'buffer': 0, 'byteOffset': index_offset, 'byteLength': index_length, 'target': 34963},
        ],
        'accessors': [
            {
                'bufferView': 0,
                'componentType': 5126,
                'count': len(vertices) // 3,
                'type': 'VEC3',
                'min': min_vals,
                'max': max_vals,
            },
            {
                'bufferView': 1,
                'componentType': 5121,
                'normalized': True,
                'count': len(colors) // 3,
                'type': 'VEC3',
            },
            {
                'bufferView': 2,
                'componentType': component_type,
                'count': len(indices),
                'type': 'SCALAR',
            },
        ],
        'meshes': [
            {
                'primitives': [
                    {
                        'attributes': {'POSITION': 0, 'COLOR_0': 1},
                        'indices': 2,
                    }
                ]
            }
        ],
        'nodes': [{'mesh': 0}],
        'scenes': [{'nodes': [0]}],
        'scene': 0,
    }

    gltf_path = out_base.with_suffix('.gltf')
    with open(gltf_path, 'w', encoding='utf-8') as f:
        json.dump(gltf, f, indent=2)

    return gltf_path, bin_path


def write_glb_from_files(gltf_path: Path, bin_path: Path, glb_path: Path):
    with open(gltf_path, 'r', encoding='utf-8') as f:
        gltf = json.load(f)

    # Embed the buffer: drop the URI so the GLB chunk is authoritative.
    for buf in gltf.get('buffers', []):
        buf.pop('uri', None)

    json_bytes = json.dumps(gltf, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    while len(json_bytes) % 4:
        json_bytes += b' '

    with open(bin_path, 'rb') as f:
        bin_bytes = f.read()
    while len(bin_bytes) % 4:
        bin_bytes += b'\x00'

    # GLB header + two chunks (JSON, BIN).
    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    with open(glb_path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total_length))
        f.write(struct.pack('<I4s', len(json_bytes), b'JSON'))
        f.write(json_bytes)
        f.write(struct.pack('<I4s', len(bin_bytes), b'BIN\x00'))
        f.write(bin_bytes)


def main():
    parser = argparse.ArgumentParser(description='Convert ASCII PLY to glTF (.gltf+.bin).')
    parser.add_argument('ply', help='Input PLY file')
    parser.add_argument('output_base', help='Output base path without extension')
    parser.add_argument('--glb', action='store_true', help='Also emit a combined .glb file')
    args = parser.parse_args()

    vertices, colors, indices = parse_ply(args.ply)
    gltf_path, bin_path = write_gltf(vertices, colors, indices, args.output_base)
    print(f'Wrote {gltf_path} and {bin_path}')

    if args.glb:
        glb_path = Path(args.output_base).with_suffix('.glb')
        write_glb_from_files(gltf_path, bin_path, glb_path)
        print(f'Wrote {glb_path}')


if __name__ == '__main__':
    main()
