# pixels

Mapping and charting pixels from remote sensing Earth observation data with JavaScript.

## charting

Histograms and 3D scatterplots of R, G, B pixel values. Choose your own Landsat 8 band combinations to explore the data.

Thanks to <https://github.com/Overv/ColorScatterPlot> for some helpful ideas when I was unsure how to assign colors my 3D scatterplot markers in Plotly.js.

Future goals:

- filter by time frame window

- filter by cloud cover

[![screenshot](https://raw.githubusercontent.com/jwasilgeo/pixels/master/charting/screenshot.png)](https://jwasilgeo.github.io/pixels/charting/)

## draw-training-sites

_(unfinished business / work in progress)_

Draw polygons to fetch pixel data about your training sites.

Future goals:

- feed training sites info into imagery algorithms in the browser

## ndvi

_(unfinished business / work in progress)_

Some trials and benchmarks for calculating and displaying 8bit ndvi from NIR and red bands in a web map on-the-fly in the browser.  This includes some truly messy pieces of code for both Esri JSAPI and OpenLayers.js.

Future goals:

- report data crunching benchmarks times in a component

- explain some of the differences and findings
