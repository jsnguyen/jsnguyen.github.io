#!/bin/bash

convert -resize 50% -strip -interlace Plane -gaussian-blur 0.05 -quality 85% "$1" "${1::-4}-red-redqual.jpg"
