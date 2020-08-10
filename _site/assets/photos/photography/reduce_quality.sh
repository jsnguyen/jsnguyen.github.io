#!/bin/bash

mogrify -resize 1000x1000 -strip -interlace Plane -quality 85% "$1"
