#!/bin/bash

for filename in *.jpg; do
  ./reduce_quality.sh "$filename"
done
