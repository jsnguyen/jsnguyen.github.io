#!/bin/bash

composite -dissolve 20% -gravity southeast \( jsn_initials_logo_watermark.png -resize 300x300 \) $1 "${1::-4}-watermark.jpg"
