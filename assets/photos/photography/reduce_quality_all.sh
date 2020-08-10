#!/bin/bash

for filename in *.jpg; do
  echo "reducing... $filename"
  ./reduce_quality.sh "$filename"
done
