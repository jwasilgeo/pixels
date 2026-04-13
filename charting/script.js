require([
  'esri/views/MapView',
  'esri/layers/ImageryLayer',
  'esri/layers/support/RasterFunction',
  'esri/layers/support/TileInfo',
  'esri/layers/FeatureLayer',
  'esri/widgets/Search',
], function (
  MapView,
  ImageryLayer,
  RasterFunction,
  TileInfo,
  FeatureLayer,
  Search
) {
  var view = new MapView({
    container: 'viewDiv',
    map: {
      // basemap: 'dark-gray'
    },
    // Poland
    // zoom: 6,
    // center: [19.19, 51.82]
    extent: {
      xmax: 2916490,
      xmin: 1355951,
      ymax: 7623739,
      ymin: 5911549,
      spatialReference: {
        latestWkid: 3857,
        wkid: 102100
      }
    },
    constraints: {
      minZoom: 2,
      // without a basemap no LODs are automatically set for us,
      // specify AGOL LODs for the view
      lods: TileInfo.create().lods
    }
  });

  view.ui.add(new Search({
    view: view,
    popupEnabled: false,
    resultGraphicEnabled: false
  }), 'top-right');

  // set the rendering rule to the 'None' raster function
  // this will allow us to gain access to the raw values assigned to each pixel
  // var rasterFunctionNone = new RasterFunction({
  //   functionName: 'None'
  // });

  // set the rendering rule to a chained server-side raster function
  // only 3 bands at a time are extracted and then they are stretched with standard deviation and DRA.
  function createExtractAndStretchRasterFunction(bandsRGB) {
    // https://developers.arcgis.com/documentation/common-data-types/raster-function-objects.htm#ESRI_SECTION1_7545363F0B8A4B7B931A54B3C4189D9D
    return new RasterFunction({
      functionName: 'Stretch',
      functionArguments: {
        StretchType: 3,
        DRA: true,
        // https://developers.arcgis.com/documentation/common-data-types/raster-function-objects.htm#ESRI_SECTION1_2FC6FEAA2801446B9578A7C90B1DD6AB
        Raster: new RasterFunction({
          functionName: 'ExtractBand',
          functionArguments: {
            bandIds: bandsRGB
          }
        })
      }
    });
  }

  // store the current pixel data after every extent change so that
  // the charts can be changed without having to fetch the pixels again
  var pixelBlockCurrent;
  function processPixelBlock(pixelBlock) {
    if (!pixelBlock || !pixelBlock.pixels) {
      pixelBlockCurrent = null;
      displayCount(null, null);
      // Plotly.purge('chartDiv');
      return;
    }

    pixelBlockCurrent = pixelBlock;

    var rgbaUint8ClampedArray = pixelBlock.getAsRGBA();

    var chartData;
    if (chartType === 'histogram') {
      chartData = processDataForHistograms(rgbaUint8ClampedArray);
      displayCount(pixelBlock.width, pixelBlock.height);
    } else {
      chartData = processDataFor3DCharts(rgbaUint8ClampedArray);
      displayCount(pixelBlock.width, pixelBlock.height, chartData.counts.length);
    }

    updateChart(chartType, chartData.dataX, chartData.dataY, chartData.dataZ, chartData.colors, chartData.counts);
  }

  function processDataForHistograms(rgbaUint8ClampedArray) {
    // loop through all the red, green, and blue pixel data
    // and store each observation in data space x, y, and z arrays for plotly

    var dataX = [];
    var dataY = [];
    var dataZ = [];

    for (var index = 0; index < rgbaUint8ClampedArray.length; index += 4) {
      var r = rgbaUint8ClampedArray[index];
      var g = rgbaUint8ClampedArray[index + 1];
      var b = rgbaUint8ClampedArray[index + 2];
      // var a = rgbaUint8ClampedArray[index + 3]; // if we ever needed the alpha

      dataX.push(r);
      dataY.push(g);
      dataZ.push(b);
    }

    return {
      dataX: dataX,
      dataY: dataY,
      dataZ: dataZ,
      colors: null // rgb() colors array only used by plotly 3D charts
    };
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    var h = 0, s = max === 0 ? 0 : delta / max, v = max;
    if (delta !== 0) {
      if (max === r)      h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else                h = (r - g) / delta + 4;
      h = ((h * 60) + 360) % 360;
    }
    // return H in 0-360, S and V scaled to 0-255 to match RGB range for binning
    return { x: h, y: s * 255, z: v * 255 };
  }

  function rgbToLab(r, g, b) {
    // sRGB -> linear RGB
    function linearize(c) {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    var lr = linearize(r), lg = linearize(g), lb = linearize(b);
    // linear RGB -> XYZ (D65 illuminant)
    var x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
    var y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750);
    var z = (lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041) / 1.08883;
    // XYZ -> Lab
    function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    return { x: 116 * f(y) - 16, y: 500 * (f(x) - f(y)), z: 200 * (f(y) - f(z)) };
  }

  function processDataFor3DCharts(rgbaUint8ClampedArray) {
    // convert each pixel to the target color space, then bin by quantized channel values.
    // bins accumulate the sum of axis values and raw RGB so we can display true per-bin
    // averages rather than synthetic bin-center coordinates or colors.
    // channel values are normalized to 0-255 before binning so binSize has consistent
    // meaning across all color spaces.

    var bins = new Map();

    for (var index = 0; index < rgbaUint8ClampedArray.length; index += 4) {
      var r = rgbaUint8ClampedArray[index];
      var g = rgbaUint8ClampedArray[index + 1];
      var b = rgbaUint8ClampedArray[index + 2];
      // var a = rgbaUint8ClampedArray[index + 3]; // if we ever needed the alpha

      var cv = colorSpace === 'hsv' ? rgbToHsv(r, g, b)
             : colorSpace === 'lab' ? rgbToLab(r, g, b)
             : { x: r, y: g, z: b };

      // normalize each channel to 0-255 for consistent bin key computation
      var nx = colorSpace === 'hsv' ? cv.x / 360 * 255
             : colorSpace === 'lab' ? cv.x / 100 * 255   // L: 0-100
             : cv.x;
      var ny = colorSpace === 'lab' ? cv.y + 128 : cv.y; // a: -128 to 127
      var nz = colorSpace === 'lab' ? cv.z + 128 : cv.z; // b: -128 to 127

      var key = (Math.floor(nx / binSize) << 16) | (Math.floor(ny / binSize) << 8) | Math.floor(nz / binSize);

      var bin = bins.get(key);
      if (bin) {
        bin.count++;
        bin.sumX += cv.x; bin.sumY += cv.y; bin.sumZ += cv.z;
        bin.sumR += r;    bin.sumG += g;    bin.sumB += b;
      } else {
        bins.set(key, { count: 1, sumX: cv.x, sumY: cv.y, sumZ: cv.z, sumR: r, sumG: g, sumB: b });
      }
    }

    // unpack bins into plotly arrays. axis values are the true average of pixels in each
    // bin; marker color is the average RGB regardless of which color space is active.
    var dataX = [], dataY = [], dataZ = [], colors = [], pixelCounts = [];

    bins.forEach(function (bin) {
      var avgR = Math.round(bin.sumR / bin.count);
      var avgG = Math.round(bin.sumG / bin.count);
      var avgB = Math.round(bin.sumB / bin.count);

      dataX.push(bin.sumX / bin.count);
      dataY.push(bin.sumY / bin.count);
      dataZ.push(bin.sumZ / bin.count);
      colors.push('rgb(' + avgR + ',' + avgG + ',' + avgB + ')');
      pixelCounts.push(bin.count);
    });

    return { dataX: dataX, dataY: dataY, dataZ: dataZ, colors: colors, counts: pixelCounts };
  }

  function getAxisConfig() {
    if (colorSpace === 'hsv') {
      return [
        { title: 'Hue',        range: [0, 360] },
        { title: 'Saturation', range: [0, 255] },
        { title: 'Value',      range: [0, 255] }
      ];
    }
    if (colorSpace === 'lab') {
      return [
        { title: 'L* (Lightness)',        range: [0, 100]    },
        { title: 'a* (green \u2192 red)', range: [-128, 127] },
        { title: 'b* (blue \u2192 yellow)', range: [-128, 127] }
      ];
    }
    return [
      { title: 'Red ('   + redBandSelectNode.options[redBandSelectNode.selectedIndex].text   + ')', range: [0, 255] },
      { title: 'Green (' + greenBandSelectNode.options[greenBandSelectNode.selectedIndex].text + ')', range: [0, 255] },
      { title: 'Blue ('  + blueBandSelectNode.options[blueBandSelectNode.selectedIndex].text  + ')', range: [0, 255] }
    ];
  }

  function getHoverLabels() {
    if (colorSpace === 'hsv') {
      return ['Hue: %{x:.1f}\xb0', 'Saturation: %{y:.0f}', 'Value: %{z:.0f}'];
    }
    if (colorSpace === 'lab') {
      return ['L*: %{x:.1f}', 'a*: %{y:.1f}', 'b*: %{z:.1f}'];
    }
    return [
      'Red (Band '   + redBandSelectNode.value   + '): %{x}',
      'Green (Band ' + greenBandSelectNode.value + '): %{y}',
      'Blue (Band '  + blueBandSelectNode.value  + '): %{z}'
    ];
  }

  function displayCount(w, h, binCount) {
    if (!w || !h) {
      document.querySelector('#countInfo').innerText = '';
      return;
    }

    var text = 'charted ' + (w * h).toLocaleString() + ' pixel color values (' + w + 'w x ' + h + 'h)';

    if (binCount !== undefined) {
      text += ' \u2192 ' + binCount.toLocaleString() + ' unique bins';
    }

    document.querySelector('#countInfo').innerText = text;
  }

  function updateChart(chartType, dataX, dataY, dataZ, colors, counts) {
    var chartInfo = getChartDataAndLayout(chartType, dataX, dataY, dataZ, colors, counts);

    Plotly.react(
      'chartDiv',
      chartInfo.data,
      chartInfo.layout,
      {
        responsive: true,
        displayModeBar: true
      }
    );
  }

  function getChartDataAndLayout(chartType, dataX, dataY, dataZ, colors, counts) {
    // handle histograms chart type separately from 3D chart types
    if (chartType === 'histogram') {
      var data = [
        {
          x: dataX,
          type: 'histogram',
          name: 'Red (' + redBandSelectNode.options[redBandSelectNode.selectedIndex].text + ')',
          opacity: 0.55,
          marker: {
            color: 'red',
          }
        },
        {
          x: dataY,
          type: 'histogram',
          name: 'Green (' + greenBandSelectNode.options[greenBandSelectNode.selectedIndex].text + ')',
          opacity: 0.55,
          marker: {
            color: 'green',
          }
        },
        {
          x: dataZ,
          type: 'histogram',
          name: 'Blue (' + blueBandSelectNode.options[blueBandSelectNode.selectedIndex].text + ')',
          opacity: 0.55,
          marker: {
            color: 'blue',
          }
        }
      ];

      var layout = {
        barmode: 'overlay',
        xaxis: {
          range: [0, 255]
        },
        yaxis: {
          title: 'frequency'
        },
        margin: {
          t: 30,
          r: 30,
          b: 30,
          l: 40
        },
        legend: {
          xanchor: 'right',
          x: 1,
          y: 1,
          bgcolor: 'rgba(0, 0, 0, 0)'
        },
        font: {
          family: '"Avenir Next W01", "Avenir Next W00", "Avenir Next", "Avenir", "Helvetica Neue", sans-serif'
        },
        hoverlabel: {
          font: {
            family: '"Avenir Next W01", "Avenir Next W00", "Avenir Next", "Avenir", "Helvetica Neue", sans-serif'
          }
        }
      };

      return {
        data: data,
        layout: layout
      };
    }

    // handle 3D chart types separately from histograms chart type
    var hoverLabels = getHoverLabels();
    var data = [{
      x: dataX,
      y: dataY,
      z: dataZ,
      customdata: counts,
      hovertemplate: hoverLabels.concat(['Pixels in bin: %{customdata:,}', '<extra></extra>']).join('<br>'),
    }];

    if (chartType === 'scatter3d') {
      // scale marker size logarithmically so dominant bins stand out without
      // overwhelming the view — rare colors still appear as small but visible dots
      var markerSizes = counts.map(function (count) {
        return Math.max(3, Math.log1p(count) * 2);
      });

      data[0].type = 'scatter3d';
      data[0].mode = 'markers';
      data[0].marker = {
        symbol: 'square',
        color: colors,
        size: markerSizes,
        sizemode: 'diameter',
        line: { width: 0 }
      };
    } else if (chartType === 'mesh3d-delaunay') {
      data[0].type = 'mesh3d';
      data[0].alphahull = -1; // Delaunay triangulation
      data[0].vertexcolor = colors;
    } else if (chartType === 'mesh3d-convex') {
      data[0].type = 'mesh3d';
      data[0].alphahull = 0; // convex-hull
      data[0].vertexcolor = colors;
    }

    var layout = {
      margin: {
        t: 10,
        r: 10,
        b: 10,
        l: 10,
      },
      scene: {
        aspectmode: 'cube',
        camera: {
          eye: {
            x: -1.6,
            y: -1.6,
            z: 0.75
          },
        },
        xaxis: getAxisConfig()[0],
        yaxis: getAxisConfig()[1],
        zaxis: getAxisConfig()[2]
      },
      font: {
        family: '"Avenir Next W01", "Avenir Next W00", "Avenir Next", "Avenir", "Helvetica Neue", sans-serif'
      },
      hoverlabel: {
        font: {
          family: '"Avenir Next W01", "Avenir Next W00", "Avenir Next", "Avenir", "Helvetica Neue", sans-serif'
        }
      },

      uirevision: 'true'
    };

    return {
      data: data,
      layout: layout
    };
  }

  var initialRedBand = 4;
  var initialGreenBand = 3;
  var initialBlueBand = 2;

  var layer = new ImageryLayer({
    url: 'https://landsat.arcgis.com/arcgis/rest/services/Landsat8_Views/ImageServer',
    // renderingRule: rasterFunctionNone,
    renderingRule: createExtractAndStretchRasterFunction([initialRedBand, initialGreenBand, initialBlueBand]),
    // pixelFilter: processPixelBlock,
    format: 'lerc'
  });

  // create options for band select elements and wire up event listeners
  // after the imagery layer has loaded and has info about its own bands
  layer.when(function () {
    for (var index = 0; index < layer.bandCount; index++) {
      var redOption = document.createElement('option');
      redOption.value = index;
      // JSAPI raster bands start at index 0,
      // and we want to display the optiont text starting with "Band 0"
      redOption.text = 'Band ' + (index + 1);
      redBandSelectNode.add(redOption);

      var greenOption = document.createElement('option');
      greenOption.value = index;
      // JSAPI raster bands start at index 0,
      // and we want to display the optiont text starting with "Band 0"
      greenOption.text = 'Band ' + (index + 1);
      greenBandSelectNode.add(greenOption);

      var blueOption = document.createElement('option');
      blueOption.value = index;
      // JSAPI raster bands start at index 0,
      // and we want to display the optiont text starting with "Band 0"
      blueOption.text = 'Band ' + (index + 1);
      blueBandSelectNode.add(blueOption);
    }

    redBandSelectNode.selectedIndex = initialRedBand;
    greenBandSelectNode.selectedIndex = initialGreenBand;
    blueBandSelectNode.selectedIndex = initialBlueBand;

    redBandSelectNode.addEventListener('input', function () {
      layer.renderingRule = createExtractAndStretchRasterFunction(
        [
          Number(redBandSelectNode.value),
          Number(greenBandSelectNode.value),
          Number(blueBandSelectNode.value)
        ]
      );
    });

    greenBandSelectNode.addEventListener('input', function () {
      layer.renderingRule = createExtractAndStretchRasterFunction(
        [
          Number(redBandSelectNode.value),
          Number(greenBandSelectNode.value),
          Number(blueBandSelectNode.value)
        ]
      );
    });

    blueBandSelectNode.addEventListener('input', function () {
      layer.renderingRule = createExtractAndStretchRasterFunction(
        [
          Number(redBandSelectNode.value),
          Number(greenBandSelectNode.value),
          Number(blueBandSelectNode.value)
        ]
      );
    });
  });

  view.map.add(layer);
  view.map.add(new FeatureLayer({
    url: 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/World_Countries_(Generalized)/FeatureServer/0',
    renderer: {
      type: 'simple',
      symbol: {
        type: 'simple-fill',
        color: 'transparent',
        outline: {
          width: 0.75,
          color: 'magenta'
        }
      }
    }
  }));

  // toggle visibility of the loading indicator when the imagery layerview is updating
  var statusNode = document.querySelector('#status');
  view
    .whenLayerView(layer)
    .then(function (layerView) {
      layerView.watch('pixelData.pixelBlock', function (pixelBlock) {
        processPixelBlock(pixelBlock);
      });

      layerView.watch('updating', function (updating) {
        if (updating) {
          statusNode.style.opacity = 1;
        } else {
          statusNode.style.opacity = 0;
        }
      });
    });

  // get references to the R G B band select elements
  var redBandSelectNode = document.querySelector('#redBandSelect');
  var greenBandSelectNode = document.querySelector('#greenBandSelect');
  var blueBandSelectNode = document.querySelector('#blueBandSelect');

  // wire up event listeners for the band combo bookmarks buttons
  document.querySelector('#trueColorButton').addEventListener('click', function () {
    redBandSelectNode.selectedIndex = 3;
    greenBandSelectNode.selectedIndex = 2;
    blueBandSelectNode.selectedIndex = 1;

    layer.renderingRule = createExtractAndStretchRasterFunction(
      [
        Number(redBandSelectNode.value),
        Number(greenBandSelectNode.value),
        Number(blueBandSelectNode.value)
      ]
    );
  });

  document.querySelector('#nirButton').addEventListener('click', function () {
    redBandSelectNode.selectedIndex = 4;
    greenBandSelectNode.selectedIndex = 3;
    blueBandSelectNode.selectedIndex = 2;

    layer.renderingRule = createExtractAndStretchRasterFunction(
      [
        Number(redBandSelectNode.value),
        Number(greenBandSelectNode.value),
        Number(blueBandSelectNode.value)
      ]
    );
  });

  document.querySelector('#urbanButton').addEventListener('click', function () {
    redBandSelectNode.selectedIndex = 6;
    greenBandSelectNode.selectedIndex = 5;
    blueBandSelectNode.selectedIndex = 3;

    layer.renderingRule = createExtractAndStretchRasterFunction(
      [
        Number(redBandSelectNode.value),
        Number(greenBandSelectNode.value),
        Number(blueBandSelectNode.value)
      ]
    );
  });

  // set default value and wire up event listener for chart type select
  var chartTypeSelectNode = document.querySelector('#chartTypeSelect');
  var chartType = chartTypeSelectNode.value;
  var binSizeControlNode = document.querySelector('#binSizeControl');
  var colorSpaceControlNode = document.querySelector('#colorSpaceControl');

  function updateControlStates() {
    var disabled = chartType === 'histogram';
    binSizeSelectNode.disabled = disabled;
    binSizeControlNode.style.opacity = disabled ? 0.4 : 1;
    colorSpaceSelectNode.disabled = disabled;
    colorSpaceControlNode.style.opacity = disabled ? 0.4 : 1;
  }

  chartTypeSelectNode.addEventListener('input', function (evt) {
    chartType = evt.target.value;
    updateControlStates();
    processPixelBlock(pixelBlockCurrent);
  });

  // set default value and wire up event listener for bin size select.
  // binSize controls 3D voxel quantization: 1 = exact RGB triplets, larger values
  // merge nearby colors into coarser bins and reduce the total number of plotted points.
  var binSizeSelectNode = document.querySelector('#binSizeSelect');
  var binSizeValueNode = document.querySelector('#binSizeValue');
  var binSize = Number(binSizeSelectNode.value);
  binSizeSelectNode.addEventListener('input', function (evt) {
    binSize = Number(evt.target.value);
    binSizeValueNode.innerText = binSize;
    processPixelBlock(pixelBlockCurrent);
  });

  var colorSpaceSelectNode = document.querySelector('#colorSpaceSelect');
  var colorSpace = colorSpaceSelectNode.value;
  colorSpaceSelectNode.addEventListener('input', function (evt) {
    colorSpace = evt.target.value;
    processPixelBlock(pixelBlockCurrent);
  });

  updateControlStates();
});
