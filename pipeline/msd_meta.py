"""B6: read the Million Song Dataset metadata for every LMD-matched track, straight from the tar stream.

Usage:  curl -sL http://hog.ee.columbia.edu/craffel/lmd/lmd_matched_h5.tar.gz | python -I pipeline/msd_meta.py out/msd-meta.json
Writes {track_id: [artist, title, year, [top artist terms]]}, sorted by track id. Only names, year and genre terms are
kept (derived metadata); nothing else from the files. Each .h5 member is opened in memory and never written to disk.
"""
import io, json, sys, tarfile
import h5py

def s(x):
    return x.decode('utf-8', 'replace').strip() if isinstance(x, bytes) else str(x).strip()

def main(out_path):
    meta, bad = {}, 0
    with tarfile.open(fileobj=sys.stdin.buffer, mode='r|gz') as tar:
        for m in tar:
            if not m.isfile() or not m.name.endswith('.h5') or m.size > 20_000_000:
                continue
            tid = m.name.rsplit('/', 1)[-1][:-3]
            try:
                with h5py.File(io.BytesIO(tar.extractfile(m).read()), 'r') as h:
                    song = h['metadata']['songs'][0]
                    artist, title = s(song['artist_name']), s(song['title'])
                    year = int(h['musicbrainz']['songs'][0]['year'])
                    terms = [s(t) for t in h['metadata']['artist_terms'][:]]
                    weights = list(h['metadata']['artist_terms_weight'][:])
                    top = [t for _, t in sorted(zip(weights, terms), key=lambda p: -p[0])][:5]
                    meta[tid] = [artist, title, year if 1900 < year < 2030 else None, top]
            except Exception:
                bad += 1
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(meta.items())), f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(meta)} tracks read, {bad} unreadable, {sum(1 for v in meta.values() if v[2])} with a year', file=sys.stderr)

if __name__ == '__main__':
    main(sys.argv[1])
