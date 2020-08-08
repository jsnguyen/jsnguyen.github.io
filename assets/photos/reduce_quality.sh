#!/bin/bash

convert -resize 1000x1000^ -strip -interlace Plane -gaussian-blur 0.05 -quality 85% "$1" "${1::-4}-redqual.jpg"
