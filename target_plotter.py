from pyscript import when, display
from pyscript import document

from pyscript import display

import asyncio

import warnings
from astropy.utils.exceptions import AstropyWarning
warnings.filterwarnings('ignore', category=AstropyWarning, append=True)

from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import matplotlib.colorbar as colorbar

from matplotlib.collections import LineCollection
from matplotlib.gridspec import GridSpec

from astropy.utils.data import Conf

Conf.allow_internet = False

import astropy.units as u
from astropy.coordinates import AltAz, SkyCoord, EarthLocation

from astropy.time import Time
from astropy.coordinates import get_sun
from astropy.coordinates import get_body
from astropy.coordinates import angular_separation
from astropy.coordinates import solar_system_ephemeris

solar_system_ephemeris.set('builtin')

loading = document.querySelector("#loading-placeholder")
ready = document.querySelector("#ready")

display_container = document.querySelector(".display-container")

if loading:
    loading.style.display = "none"
    ready.style.display = "block"

if display_container:
    display_container.classList.remove("loading")

# Enable the plot button now that PyScript is ready
plot_button = document.querySelector("#plot_button")
if plot_button:
    plot_button.disabled = False

@when("click", "#plot_button")
async def handle_click(event):
    # Show loading spinner and disable button
    plot_loading = document.querySelector("#plot-loading")
    #plot_button = document.querySelector("#plot_button")
    display_container = document.querySelector(".display-container")
    
    if plot_loading:
        display("", append=False)
        ready.style.display = "none"
        plot_loading.style.display = "block"

    #if plot_button:
    #    plot_button.disabled = True
    
    # Allow DOM to update by yielding control
    await asyncio.sleep(0.05)
    
    # Get input values
    ra_input = document.querySelector("#ra_input")
    dec_input = document.querySelector("#dec_input")
    date_input = document.querySelector("#date_input")
    lat_input = document.querySelector("#lat_input")
    lon_input = document.querySelector("#lon_input")
    height_input = document.querySelector("#height_input")

    location = EarthLocation(lon=float(lon_input.value), lat=float(lat_input.value), height=float(height_input.value)*u.meter)
    
    # Generate the plot
    fig = make_target_plot(location, ra_input.value, dec_input.value, date_input.value)
    
    # Hide loading spinner and display plot
    if plot_loading:
        plot_loading.style.display = "none"
    if display_container:
        display_container.classList.remove("loading")
    display(fig, append=False)
    
    # Re-enable button
    if plot_button:
        plot_button.disabled = False

# from https://www2.keck.hawaii.edu/inst/common/TelLimits.html
# 0 for not visible
# 1 for vignetted
# 2 for visible
def keck_ii_visibility(alt, az):
    if 185.3 <= az < 332.8:
        if 36.8 <= alt < 89.5:
            return 2
        else:
            return 0
    else:
        if 0.0 <= alt < 18.0:
            return 1
        elif 18.0 <= alt < 89.5:
            return 2
        else:
            return 0

def moon_sep_visiblity(moon_sep):
    if moon_sep < 5:
        return False
    else:
        return True

def check_visibility(alt, az):
    if alt < 0:
        return 0
    else:
        return keck_ii_visibility(alt, az)

def find_bounds(boolean_list):
    bounds = []
    start_index = None

    for i, value in enumerate(boolean_list):
        if value:
            if start_index is None:
                start_index = i
        else:
            if start_index is not None:
                bounds.append((start_index, i - 1))
                start_index = None
    
    if start_index is not None:
        bounds.append((start_index, len(boolean_list) - 1))
    
    return bounds

def make_target_plot(location, ra, dec, date):

    delta_hours = 8
    delta_midnight = np.linspace(-delta_hours, delta_hours, 1000) * u.hour

    hst_to_utc_offset = 10 * u.hour # hst to utc

    tick_interval = 2
    tick_range = np.arange(-delta_hours, delta_hours+tick_interval,tick_interval)

    utc_midnight = Time(f'{date} 00:00:00', scale='utc') + hst_to_utc_offset
    time_ticks = utc_midnight + tick_range*u.hour
    time_ticks.out_subfmt = 'date_hm'
    time_ticks = [el.split()[-1] for el in time_ticks.value]

    times = utc_midnight + delta_midnight
    frame = AltAz(obstime=times, location=location) # this obstime takes times in utc

    sun = get_sun(times)
    moon = get_body('moon', times)

    altaz_sun = sun.transform_to(frame)
    altaz_moon = moon.transform_to(frame)

    object_skycoord = SkyCoord(ra,dec, unit=(u.hourangle, u.deg))
    altaz_target = object_skycoord.transform_to(frame)

    save_path = Path('targets')
    save_path.mkdir(exist_ok=True)

    twilight = altaz_sun.alt < 0 * u.deg
    night = altaz_sun.alt < -12 * u.deg

    moon_seps = angular_separation(altaz_target.az, altaz_target.alt, altaz_moon.az, altaz_moon.alt).to(u.degree).value

    visibility=[]
    for alt,az in zip(altaz_target.alt, altaz_target.az):
        vis = check_visibility(alt.to(u.degree).value,az.to(u.degree).value)
        visibility.append(vis)
    visibility_bool = list(map(lambda x: x==2,visibility))
    visibility_bool = np.logical_and(visibility_bool, night)

    time_visible = 0*u.hour
    vb = find_bounds(visibility_bool)
    if len(vb) == 1:
        visibility_bound = vb[0]
        visibility_start = times[visibility_bound[0]]
        visibility_end = times[visibility_bound[1]]
        time_visible = visibility_end-visibility_start
        time_visible = time_visible.to(u.hour)

    # make custom cmap for the moon sep bounds
    cmap = mcolors.ListedColormap(['#ff3a3ad9', '#f8d53c', '#61f286d9'])
    bounds = [0,1,2,3]
    norm = mcolors.BoundaryNorm(bounds, cmap.N)

    fig = plt.figure(figsize=(6,4))

    fig.patch.set_facecolor('none')  # Make figure background transparent
    fig.subplots_adjust(hspace=0.05)

    # use gridspec here to make the colorbar play nicely
    gs = GridSpec(2, 2, width_ratios=[1, 0.05], height_ratios=[1, 1], wspace=0.1)
    axs = []
    axs.append(fig.add_subplot(gs[0, 0]))
    axs.append(fig.add_subplot(gs[1, 0]))

    #
    # make first plot
    #

    x = delta_midnight
    y = altaz_target.az
    z = visibility

    points = np.array([x, y]).T.reshape(-1, 1, 2)
    segments = np.concatenate([points[:-1], points[1:]], axis=1)
    
    lc = LineCollection(segments, cmap=cmap, norm=norm, linewidth=2, label='Target')
    lc.set_array(z)
    lc.set_linewidth(3)
    axs[0].add_collection(lc)

    axs[0].set_ylabel('Azimuth [deg]')

    axs[0].set_ylim(0, 360)

    # get rid of ticks for this plot
    axs[0].get_xaxis().set_ticklabels([])
    axs[0].tick_params('x', length=0, width=0, which='major')

    #
    # make second plot
    #

    x = delta_midnight
    y = altaz_target.alt
    z = visibility

    points = np.array([x, y]).T.reshape(-1, 1, 2)
    segments = np.concatenate([points[:-1], points[1:]], axis=1)
    
    lc = LineCollection(segments, cmap=cmap, norm=norm, linewidth=2, label='Target')
    lc.set_array(z)
    lc.set_linewidth(3)
    axs[1].add_collection(lc)

    axs[1].set_ylim(0, 90)

    axs[1].set_xlabel('UTC Time')
    axs[1].set_ylabel('Altitude [deg]')

    # settings that apply to both axes
    for ax in axs:
        ax.set_xlim(-8,8)
        ax.set_xticks(tick_range)
        ax.fill_between(delta_midnight.value, 0 , 360 , night, alpha=0.15, color='k')
        ax.fill_between(delta_midnight.value, 0 , 360 , twilight, alpha=0.25, color='k')
        ax.grid()

    axs[1].set_xticklabels(time_ticks, rotation=45) # have to set this after ticks

    #
    # colorbar
    #

    cax = fig.add_subplot(gs[:, 1])
    colorbar.ColorbarBase(cax, cmap=cmap, norm=norm, ticks=bounds, spacing='proportional', orientation='vertical')
    cax.set_yticks([0.5, 1.5, 2.5])
    cax.set_yticklabels(['Not Visible', 'Vignetted', 'Visible'], va='center', rotation=90)

    ax.text(0.5, 1.2, f' Time Visible: {time_visible:.2f}     Min Moon Sep: {np.min(moon_seps):.2f} deg ',
            horizontalalignment='center',
            verticalalignment='center',
            transform = axs[0].transAxes,
            bbox=dict(facecolor='white', edgecolor='black', boxstyle='round,pad=0.25'))
    
    return fig