#!/bin/bash


for filename in *.jpg; do
  ./watermark_photos.sh "$filename"
done
