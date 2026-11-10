# Running the Backline pipeline on your laptop

Use this when GitHub Actions can't reach the Lakh mirror, or for the optional B6 metadata step.

## One-time setup
1. Install **Node.js LTS** (free) from https://nodejs.org — check with `node --version` (22 or later).
2. Install **Git** (https://git-scm.com) and clone the repo:
   ```
   git clone https://github.com/aaditya-verma/backline.git
   ```
3. Make two folders **outside** the repo, e.g. `~/lakh/dl` (archives) and `~/lakh/scratch` (unpacked files). The pipeline refuses to unpack inside the repo, and `.gitignore` blocks `*.mid`, `*.midi`, `*.tar.gz`, `*.h5` as a second guard.
4. Only for B6: install **Python 3** and `pip install h5py`.

## B0 probe
1. Put `clean_midi.tar.gz` in `~/lakh/dl` (from the Lakh page, or your Drive copy in Projects › Backline › lakh-source). Note how long the download took, in seconds.
2. From inside the `backline` folder (the scratch folder must be empty):
   ```
   node pipeline/probe.mjs --src ~/lakh/dl/clean_midi.tar.gz --scratch ~/lakh/scratch/probe --download-sec <seconds> --where laptop
   ```
   Windows (PowerShell): same command with paths like `C:\lakh\dl\clean_midi.tar.gz` (Windows 10+ has `tar` built in).
3. Paste the JSON it prints into the Backline chat. It contains only numbers, no file names.
4. Afterwards you can delete `~/lakh/scratch/probe`.

## B3 build (later)
```
node pipeline/build.mjs --src ~/lakh/dl/clean_midi.tar.gz --out data/v1
```
Then commit `data/v1` to the `data` branch and push; the Pages workflow publishes it.

## B6 metadata (optional, later)
```
python pipeline/msd_meta.py --src <metadata archive> --out data/v1/meta.json
```
