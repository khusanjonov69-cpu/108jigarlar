#!/bin/sh
set -eu
BASE="https://raw.githubusercontent.com/MMWilliams/char-kit/master/characters"
mkdir -p public/assets/characters
for id in mh_1000 mh_1037 mh_1148 mh_3122 mh_3244 mh_3549; do
  echo "Downloading $id.glb"
  curl -fL --retry 3 --connect-timeout 20 "$BASE/$id.glb" -o "public/assets/characters/$id.glb"
done
printf '%s\n' 'Real rigged GLB character assets downloaded from MMWilliams/char-kit at image build time.' > public/assets/characters/README.txt
