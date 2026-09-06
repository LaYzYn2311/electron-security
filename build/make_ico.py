import struct
import sys

def build_ico(png_paths_sizes, out_path):
    # png_paths_sizes: list of (path, size) — size used for the directory entry (0 means 256)
    entries = []
    images = []
    for path, size in png_paths_sizes:
        with open(path, 'rb') as f:
            data = f.read()
        images.append(data)
        entries.append(size)

    n = len(images)
    header = struct.pack('<HHH', 0, 1, n)  # reserved, type=1 (icon), count

    dir_entries = b''
    offset = 6 + 16 * n
    for size, data in zip(entries, images):
        w = 0 if size >= 256 else size
        h = 0 if size >= 256 else size
        dir_entries += struct.pack('<BBBBHHII', w, h, 0, 0, 1, 32, len(data), offset)
        offset += len(data)

    with open(out_path, 'wb') as f:
        f.write(header)
        f.write(dir_entries)
        for data in images:
            f.write(data)

if __name__ == '__main__':
    sizes = [16, 32, 48, 64, 128, 256]
    pairs = [(f'icon.iconset_win/icon_{s}.png', s) for s in sizes]
    build_ico(pairs, 'icon.ico')
    print('wrote icon.ico')
